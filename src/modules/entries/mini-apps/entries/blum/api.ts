import type { AxiosInstance } from 'axios'
import { useUserBot } from 'src/telegram/index.js'
import { doFloodProtect } from 'src/telegram/helpers/index.js'
import { defineMiniAppApi } from '../../helpers/define.js'
import { BlumStatic } from './static.js'

export interface GetTokenResult {
  token: {
    access: string
    refresh: string
    user: {
      id: {
        id: string
      }
      username: string
    }
  }
  justCreated: boolean
}

async function getToken(axiosClient: AxiosInstance) {
  const userBot = await useUserBot()
  const webAppData = await userBot.getWebAppData(BlumStatic.BOT_ENTITY, BlumStatic.URL)

  let data
  try {
    data = (await axiosClient.post<GetTokenResult>(
      'https://gateway.blum.codes/v1/auth/provider/PROVIDER_TELEGRAM_MINI_APP',
      { query: webAppData },
    )).data
  }
  catch {
    void 0
  }

  if (!data) {
    await doFloodProtect()
    data = (await axiosClient.post<GetTokenResult>(
      'https://user-domain.blum.codes/api/v1/auth/provider/PROVIDER_TELEGRAM_MINI_APP',
      { query: webAppData },
    )).data
  }

  const { access: authToken } = data.token
  if (!authToken) {
    throw new Error('Can not login. auth-by-telegram-webapp return result without authToken')
  }

  return {
    ...data,
    authToken,
  }
}

export interface GetBalanceResponce {
  availableBalance: string
  playPasses: number
  isFastFarmingEnabled: boolean
  timestamp: number
  farming?: {
    startTime: number
    endTime: number
    earningsRate: string
    balance: string
  }
}

async function getBalance(axiosClient: AxiosInstance) {
  const response = await axiosClient<GetBalanceResponce>({
    url: 'https://game-domain.blum.codes/api/v1/user/balance',
    method: 'GET',
  })
  return response.data
}

export interface GetFriendBalanceResponse {
  limitInvitation: number
  usedInvitation: number
  amountForClaim: string
  referralToken: string
  percentFromFriends: number
  percentFromFriendsOfFriends: number
  canClaim: boolean
  canClaimAt: string
}

async function getFriendsBalance(axiosClient: AxiosInstance) {
  const response = await axiosClient<GetFriendBalanceResponse>({
    url: 'https://user-domain.blum.codes/api/v1/friends/balance',
    method: 'GET',
  })
  return response.data
}

async function claimDailyReward(axiosClient: AxiosInstance) {
  await axiosClient({
    url: 'https://game-domain.blum.codes/api/v1/daily-reward?offset=-420',
    method: 'POST',
    data: null,
  })
}

async function startFarming(axiosClient: AxiosInstance) {
  const { data } = await axiosClient({
    url: 'https://game-domain.blum.codes/api/v1/farming/start',
    method: 'POST',
    data: null,
  })
  return data
}

async function claimFarming(axiosClient: AxiosInstance) {
  const { data } = await axiosClient({
    url: 'https://game-domain.blum.codes/api/v1/farming/claim',
    method: 'POST',
    data: null,
  })
  return data
}

export interface ClaimFriendsResponse {
  claimBalance: number
}

async function claimFriends(axiosClient: AxiosInstance) {
  const { data } = await axiosClient<ClaimFriendsResponse>({
    url: 'https://game-domain.blum.codes/api/v1/friends/claim',
    method: 'POST',
    data: null,
  })
  return data
}

export interface BaseTaskItem {
  id: string
  kind: string
  type: string
  status: string
  validationType: string
  iconFileKey: string
  bannerFileKey: string
  title: string
  productName: string
  description: string
  reward: string
  isHidden: boolean
  isDisclaimerRequired: boolean
}

// subSections and subTask is similarity
export interface SubTaskItem extends BaseTaskItem {
  // kind = INITIAL
  socialSubscription?: {
    openInTelegram: boolean
    url: string
  }[]
  // kind = ONGOING
  progressTarget?: {
    accuracy: number
    postfix: string
    progress: string
    target: string
  }
}
export interface TaskItem extends BaseTaskItem {
  subTasks: SubTaskItem[]
}

export interface TaskListItem {
  sectionType: string
  subSections: {
    title: string
    tasks: SubTaskItem[]
  }[]
  tasks: TaskItem[]
}

async function getTasks(axiosClient: AxiosInstance) {
  const { data } = await axiosClient<TaskListItem[]>({
    url: 'https://earn-domain.blum.codes/api/v1/tasks',
    method: 'GET',
  })
  return data
}

async function startTask(axiosClient: AxiosInstance, taskId: string) {
  const { data } = await axiosClient({
    url: `https://earn-domain.blum.codes/api/v1/tasks/${taskId}/start`,
    method: 'POST',
    data: null,
  })
  return data
}

async function validateTask(axiosClient: AxiosInstance, taskId: string, body: object) {
  const { data } = await axiosClient({
    url: `https://earn-domain.blum.codes/api/v1/tasks/${taskId}/validate`,
    method: 'POST',
    params: {
      data: body,
    },
    data: null,
  })
  return data
}

async function claimTaskReward(axiosClient: AxiosInstance, taskId: string) {
  const { data } = await axiosClient({
    url: `https://earn-domain.blum.codes/api/v1/tasks/${taskId}/claim`,
    method: 'POST',
    data: null,
  })
  return data
}

export interface StartGameResult {
  gameId: string
}

async function startGame(axiosClient: AxiosInstance) {
  const { data } = await axiosClient<StartGameResult>({
    url: 'https://game-domain.blum.codes/api/v1/game/play',
    method: 'POST',
    data: null,
  })
  return data
}

async function claimGame(axiosClient: AxiosInstance, gameId: string, points: number) {
  await axiosClient({
    url: `https://game-domain.blum.codes/api/v1/game/claim`,
    method: 'POST',
    data: {
      gameId,
      points,
    },
  })
}

async function getAnswer(axiosClient: AxiosInstance) {
  return axiosClient({
    url: `https://akasakaid.github.io/blum/answer.json`,
    method: 'GET',
    headers: {
      'Authorization': '',
      'User-Agent': 'Marin Kitagawa',
    },
  })
}

export const BlumApi = defineMiniAppApi({
  getToken,
  getBalance,
  getFriendsBalance,
  claimFarming,
  claimFriends,
  claimDailyReward,
  startFarming,
  getTasks,
  claimTaskReward,
  startGame,
  claimGame,
  startTask,
  validateTask,
  getAnswer,
})
