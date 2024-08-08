import { defineMiniAppApi } from 'src/mini-apps/helpers/define.js'
import { getAccountInfo } from './account-info.js'
import { authByTelegramWebapp } from './auth.js'
import { getClickerUser } from './clicker-user.js'
import { getConfig } from './config.js'
import { tap } from './tap.js'

export const HamsterApi = defineMiniAppApi({
  getAccountInfo,
  authByTelegramWebapp,
  getClickerUser,
  tap,
  getConfig,
})
