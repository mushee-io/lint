export type MarketStatus = "OPEN" | "CLOSED" | "RESOLVED";
export type Score = { overall: number; clarity: number; resolutionQuality: number; outcomeCompleteness: number; duplicateRisk: number; manipulationRisk: number; sourceReliability: number; timeDefinition: number; settlementAmbiguity: number; };
export type Market = { id:string; externalId:string; protocol:string; chain:string; title:string; description:string; outcomes:string[]; category:string; tags:string[]; createdAt:string; closeTime:string; resolutionTime:string; resolutionSource:string; status:MarketStatus; marketUrl:string; creator:string; liquidity:number; volume:number; prices:number[]; canonicalMarketId?:string; canonicalEventId:string; score:Score };
export type CanonicalEvent = { id:string; title:string; description:string; category:string; tags:string[] };
export type Duplicate = { market: Market; similarity:number; explanation:string; protocol:string };
