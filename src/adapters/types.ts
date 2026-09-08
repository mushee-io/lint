import { Market } from "@/lib/market-types";
export interface MarketAdapter { protocol:string; getMarkets():Promise<Market[]>; getMarket(id:string):Promise<Market|undefined>; normalizeMarket(input:unknown):Market; getMarketState(id:string):Promise<Pick<Market,"status"|"prices"|"liquidity"|"volume">|undefined>; searchMarkets(query:string):Promise<Market[]>; }
