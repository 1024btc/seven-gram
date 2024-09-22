import { randomInt } from 'node:crypto'
import { convertToMilliseconds, sleep } from 'src/shared.js'
import { doFloodProtect } from 'src/telegram/helpers/index.js'
import { AxiosError } from 'axios'
import { defineMiniApp } from '../../helpers/define.js'
import { MiniAppName } from '../../enums.js'
import { createMiniAppConfigDatabase } from '../../helpers/config-database.js'
import type { SubTaskItem, TaskItem } from './api.js'
import { BlumApi } from './api.js'
import { BlumStatic } from './static.js'

export const blumMiniApp = defineMiniApp({
  name: MiniAppName.BLUM,
  api: BlumApi,
  configDatabase: createMiniAppConfigDatabase(MiniAppName.BLUM),
  login: {
    async callback(createAxios) {
      const axiosClient = createAxios({ headers: BlumStatic.DEFAULT_HEADERS })
      const { authToken } = await BlumApi.getToken(axiosClient)
      axiosClient.defaults.headers.common.Authorization = `Bearer ${authToken}`

      return axiosClient
    },
    lifetime: convertToMilliseconds({ hours: 24 }),
  },
  callbackEntities: [
    {
      name: 'Daily Reward',
      async callback({ logger, api }) {
        try {
          await api.claimDailyReward()
          await logger.success(`Daily reward was successfully claimed`)
        }
        catch (error) {
          if (error instanceof AxiosError) {
            await logger.info(`Can not claim daily reward. Maybe reward was claimed yet`)
            throw error
          }
        }
      },
      timeout: ({ createCronTimeoutWithDeviation }) =>
        createCronTimeoutWithDeviation('0 9 * * *', convertToMilliseconds({ minutes: 30 })),
    },
    {
      name: 'Friends Reward',
      async callback({ logger, api }) {
        try {
          const balance = await api.getFriendsBalance()

          if (balance.canClaim) {
            const result = await api.claimFriends()
            if (result.claimBalance) {
              await logger.success(`Referral reward was successfully claimed`)
            }
            else {
              await logger.info(`Can not claim referral reward. Maybe reward was claimed yet`)
            }
          }
        }
        catch (error) {
          if (error instanceof AxiosError) {
            await logger.error(`Friends Reward claimed error. Maybe is network error`)
            throw error
          }
        }
      },
      timeout: ({ createCronTimeoutWithDeviation }) =>
        createCronTimeoutWithDeviation('0 9 * * *', convertToMilliseconds({ minutes: 30 })),
    },
    {
      name: 'Farming',
      async callback({ logger, api }) {
        let balance = await api.getBalance()

        if (!balance.farming) {
          await logger.info(`Starting farming...`)
          await api.startFarming()
          await doFloodProtect()
          await logger.success(`Farming started`)
          balance = await api.getBalance()
          const timeToFarmingEnd = balance.farming?.endTime ?? 0 - Date.now()
          if (timeToFarmingEnd > 0) {
            return {
              extraRestartTimeout: randomInt(
                timeToFarmingEnd + convertToMilliseconds({ minutes: 1 }),
                timeToFarmingEnd + convertToMilliseconds({ minutes: 3 }),
              ),
            }
          }
          return
        }

        let timeToFarmingEnd = balance.farming.endTime - Date.now()

        if (timeToFarmingEnd <= 0) {
          await api.claimFarming()
          await doFloodProtect()
          await logger.info(`Starting farming...`)
          await api.startFarming()
          await doFloodProtect()
          await logger.success(`Farming started`)
          balance = await api.getBalance()
          if (balance.farming)
            timeToFarmingEnd = balance.farming.endTime - Date.now()
          if (timeToFarmingEnd > 0) {
            return {
              extraRestartTimeout: randomInt(
                timeToFarmingEnd + convertToMilliseconds({ minutes: 1 }),
                timeToFarmingEnd + convertToMilliseconds({ minutes: 3 }),
              ),
            }
          }
        }
        else {
          await logger.info(`Farming is already started`)
          return {
            extraRestartTimeout: randomInt(
              timeToFarmingEnd + convertToMilliseconds({ minutes: 1 }),
              timeToFarmingEnd + convertToMilliseconds({ minutes: 3 }),
            ),
          }
        }
      },
      timeout: () => randomInt(
        convertToMilliseconds({ hours: 8 }),
        convertToMilliseconds({ hours: 8, minutes: 5 }),
      ),
    },
    {
      name: 'Play Passes',
      async callback({ logger, api }) {
        const POINTS_PER_GAME = [200, 230] as const
        let balance = await api.getBalance()

        if (!balance.playPasses) {
          await logger.info(`There are no play passes. Sleep...`)
          return
        }

        const randomGamesCount = balance.playPasses <= 5
          ? balance.playPasses
          : randomInt(
            5,
            balance.playPasses < 10 ? balance.playPasses : 10,
          )
        await logger.info(`Starting ${randomGamesCount} game sessions`)

        let claimedGamesCount = 0
        for (let i = 0; i < randomGamesCount; i++) {
          try {
            const { gameId } = await api.startGame()
            const timeToSleep = randomInt(
              convertToMilliseconds({ seconds: 29 }),
              convertToMilliseconds({ seconds: 37 }),
            )
            const randomPointsCount = randomInt(POINTS_PER_GAME[0], POINTS_PER_GAME[1])
            await logger.info(
              `Starting ${gameId} game session...`
              + `\nSleep time: ${timeToSleep / 1000} seconds`
              + `\nPoints to farm : ${randomPointsCount}`,
            )
            await sleep(timeToSleep)
            await api.claimGame(gameId, randomPointsCount)
            balance = await api.getBalance()
            await logger.success(
              `Game session ${gameId} done.`
              + `\nTotal points: ${balance.availableBalance} (+${randomPointsCount})`
              + `\nPasses left: ${balance.playPasses}`,
            )
            await sleep(randomInt(
              convertToMilliseconds({ seconds: 10 }),
              convertToMilliseconds({ seconds: 20 }),
            ))
            claimedGamesCount++
          }
          catch (error) {
            if (i === randomGamesCount - 1 && claimedGamesCount === 0) {
              throw (error)
            }

            if (error instanceof AxiosError) {
              await logger.error(
                `An error occurs while executing game iteration with index ${i + 1}`
                + `\n\`\`\`Message: ${error.message}\`\`\``
                + `\nSkipping game...`,
              )
              await sleep(convertToMilliseconds({ seconds: 15 }))
            }
          }
        }

        if (balance.playPasses) {
          return {
            extraRestartTimeout: randomInt(
              convertToMilliseconds({ minutes: 25 }),
              convertToMilliseconds({ minutes: 35 }),
            ),
          }
        }
      },
      timeout: ({ createCronTimeoutWithDeviation }) =>
        createCronTimeoutWithDeviation('0 11 * * *', convertToMilliseconds({ minutes: 30 })),
    },
    {
      name: 'run tasks',
      async callback({ logger, api }) {
        const tasks = await api.getTasks()
        const taskList = []
        for (const item of tasks) {
          if (item.tasks.length) {
            for (const task of item.tasks) {
              if (task.subTasks?.length) {
                taskList.push(...task.subTasks)
              }
              else {
                taskList.push(task)
              }
            }
          }
          if (item.subSections?.length) {
            for (const subSelection of item.subSections) {
              taskList.push(...subSelection.tasks)
            }
          }
        }
        const doTask = async (task: TaskItem | SubTaskItem) => {
          // eslint-disable-next-line no-async-promise-executor
          return new Promise<void>(async (resolve) => {
            const { id: task_id, type: task_type, title: task_title, validationType: validation_type } = task
            let task_status = task.status
            while (true) {
              if (task_status === 'FINISHED') {
                console.log(`${task_id} has completed`)
                return resolve()
              }
              if (task_status === 'READY_FOR_CLAIM' || task_status === 'STARTED') {
                try {
                  const { message, status } = await api.claimTaskReward(task_id)
                  if (message)
                    return resolve()
                  if (status === 'FINISHED') {
                    await logger.success(`success complete task ${task_type}[${task_id}] !`)
                  }
                }
                catch (error) {
                  // eslint-disable-next-line ts/ban-ts-comment
                  // @ts-expect-error
                  logger.info(`task ${task_title}[${task_id}] claim error: ${error.response.data.message}`)
                }
                return resolve()
              }
              if (task_status === 'NOT_STARTED' || task_type === 'PROGRESS_TARGET') {
                return resolve()
              }
              if (task_status === 'NOT_STARTED') {
                const { message, status } = await api.startTask(task_id)
                await sleep(randomInt(
                  convertToMilliseconds({ seconds: 3 }),
                  convertToMilliseconds({ seconds: 5 }),
                ))
                if (message)
                  return resolve()
                task_status = status
                continue
              }
              if (validation_type === 'KEYWORD' || task_status === 'READY_FOR_VERIFY') {
                const answers = await api.getAnswer() as { [key: string]: any }
                const answer = answers[task_id]
                if (!answer) {
                  await logger.info(`answers to quiz tasks are not yet available.`)
                  return resolve()
                }
                const { message, status } = await api.validateTask(task_id, { keyword: answer })
                if (message)
                  return resolve()
                task_status = status
                continue
              }
              await logger.error(`unknown type or status of task [ ${validation_type} or ${task_status} ]`)
              return resolve()
            }
          })
        }
        for (const task of taskList) {
          await doTask(task)
        }
      },
      timeout: ({ createCronTimeoutWithDeviation }) =>
        createCronTimeoutWithDeviation('0 11 * * *', convertToMilliseconds({ minutes: 30 })),
    },
  ],
})
