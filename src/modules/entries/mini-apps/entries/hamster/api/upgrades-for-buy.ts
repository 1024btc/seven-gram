import type { AxiosInstance } from 'axios'
import type { HamsterTypes } from '../index.js'

interface GetUpgradesForBuyResponse {
  upgradesForBuy: HamsterTypes.UpgradeForBuy[]
  sections: HamsterTypes.SectionElement[]
  dailyCombo: HamsterTypes.DailyCombo
}

export async function getUpgradesForBuy(axiosClient: AxiosInstance): Promise<GetUpgradesForBuyResponse> {
  const response = await axiosClient.post<GetUpgradesForBuyResponse>(
    'https://api.hamsterkombatgame.io/clicker/upgrades-for-buy',
    null,
  )

  return response.data
}

interface BuyUpgradeResponse {
  upgradesForBuy: HamsterTypes.UpgradeForBuy[]
  clickerUser: HamsterTypes.ClickerUser
  dailyCombo: HamsterTypes.DailyCombo
}

export async function buyUpgrade(axiosClient: AxiosInstance, upgradeId: string): Promise<BuyUpgradeResponse> {
  const response = await axiosClient.post<BuyUpgradeResponse>(
    'https://api.hamsterkombatgame.io/clicker/buy-upgrade',
    {
      upgradeId,
      timestamp: Date.now(),
    },
  )

  return response.data
}
