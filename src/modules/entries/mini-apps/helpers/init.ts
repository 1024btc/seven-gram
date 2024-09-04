import { randomInt } from 'node:crypto'
import type { AxiosInstance } from 'axios'
import axios, { AxiosError } from 'axios'
import type { AnyFn } from 'src/shared.js'
import { createCronTimeoutWithDeviation, sleep } from 'src/shared.js'
import { useUserBot } from 'src/telegram/index.js'
import { miniApps } from 'src/modules/entries/mini-apps/index.js'
import { CronTime } from 'cron'

const callbacksQueue = (() => {
  const callbacksQueueEntries: [AnyFn, AnyFn][] = [];

  (async () => {
    while (true) {
      if (callbacksQueueEntries.length) {
        await callbacksQueueEntries.pop()?.[1]?.()
      }
      await sleep(1000)
    }
  })()

  function has(keyCallback: AnyFn) {
    return callbacksQueueEntries.some(entry => entry[0] === keyCallback)
  }

  function addCallback<GCallbackReturnType>(keyCallback: AnyFn, callback: (...args: any[]) => GCallbackReturnType) {
    const { promise, resolve, reject } = Promise.withResolvers<Awaited<GCallbackReturnType>>()

    callbacksQueueEntries.unshift([
      keyCallback,
      async () => {
        try {
          const callbackResult = await callback()
          resolve(callbackResult)
        }
        catch (error) {
          reject(error)
        }
      },
    ])

    return {
      subscribe: () => promise,
    }
  }

  return {
    addCallback,
    has,
  }
})()

export async function initMiniApps() {
  const usersBots = [await useUserBot()]
  for (const userBot of usersBots) {
    const userBotId = Number(userBot.me.id)

    for (const miniApp of miniApps) {
      const configDatabase = miniApp.configDatabase
      const session = configDatabase.database.data.sessions[userBotId]

      for (const [callbackEntity, callbackEntityIndex] of miniApp.callbackEntities.map((value, index) => [value, index] as const)) {
        let axiosClient: AxiosInstance | undefined
        const useAxiosClient = async (): Promise<AxiosInstance> => {
          const headersWrapper = session?.headersWrapper
          const isHeadersExpired = !headersWrapper || new Date(headersWrapper.expirationDate) <= new Date()

          if (isHeadersExpired) {
            axiosClient = await miniApp.login.callback(axios.create)
            configDatabase.updateSessionLoginHeaders(userBotId, axiosClient.defaults.headers, miniApp.login.lifetime)
          }
          else if (!axiosClient) {
            axiosClient = axios.create({
              headers: headersWrapper.headers,
            })
            configDatabase.updateSessionLoginHeaders(userBotId, axiosClient.defaults.headers, miniApp.login.lifetime)
          }

          return axiosClient
        }

        const callbackEntityConfig = configDatabase.getCallbackEntity(userBotId, {
          miniAppName: miniApp.name,
          callbackEntityName: callbackEntity.name,
          callbackEntityIndex,
        })
        const nextExecutionDateExpired = !callbackEntityConfig || new Date(callbackEntityConfig.nextExecutionDate) <= new Date()

        const getCallbackEntityTimeout = () => callbackEntity.timeout({
          createCronTime: (options: any) => new CronTime(options),
          randomInt,
          createCronTimeoutWithDeviation,
        })

        const timeoutSheduledHandler = async () => {
          let callbackResult
          try {
            if (callbacksQueue.has(callbackEntity.callback) === false) {
              const axiosClient = await useAxiosClient()
              callbackResult = await callbacksQueue.addCallback(
                callbackEntity.callback,
                () => callbackEntity.callback({
                  ...miniApp.public,
                  axiosClient,
                  userBot,
                  api: Object.fromEntries(
                    Object.entries(miniApp.api).map(([key, value]) => [key, (value as AnyFn).bind(globalThis, axiosClient)]),
                  ) as Record<keyof typeof miniApp.api, AnyFn>,
                }),
              )
                .subscribe()
            }
          }
          catch (error) {
            if (error instanceof AxiosError) {
              await miniApp.public.logger.error({
                plainMessage: `Module |${callbackEntity.name}| was executed with error.\nMessage: ${JSON.stringify(error.response?.data ?? error.message)}`,
                markdownMessage: `Module |${callbackEntity.name}| was executed with error.\`\`\`Message: ${JSON.stringify(error.response?.data ?? error.message)}\`\`\``,
              })
            }
            else if (error instanceof Error) {
              await miniApp.public.logger.error({
                plainMessage: `An unhandled error occurs.\nMessage: ${error.message}`,
                markdownMessage: `An unhandled error occurs.\`\`\`Message: ${error.message}\`\`\``,
              })
            }
          }

          const timeoutDuration = callbackResult?.extraRestartTimeout ?? getCallbackEntityTimeout()

          configDatabase.updateCallbackEntity(
            userBotId,
            {
              miniAppName: miniApp.name,
              callbackEntityName: callbackEntity.name,
              callbackEntityIndex,
            },
            {
              nextExecutionDate: new Date(Date.now() + timeoutDuration).toJSON(),
            },
          )
          setTimeout(timeoutSheduledHandler, timeoutDuration)
        }

        if (nextExecutionDateExpired) {
          timeoutSheduledHandler()
        }
        else {
          setTimeout(timeoutSheduledHandler, getCallbackEntityTimeout())
        }
      }
    }
  }
}
