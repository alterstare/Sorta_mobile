// 분류 정보 파일 (<정리 폴더>/.sorta/library.sortapack): the shape Sorta (PC)
// writes — gzip JSON, `.sortapack` v2 (desktop src/core/pack.ts). The phone
// only reads it; its own changes go into 모바일 변경 파일 (mobile.ts).

export const PACK_FORMAT = 'sorta-pack'
export const PACK_VERSION = 2

export interface PackAffiliation {
  key: string
  name: string
  aliases: string[]
  parent: string | null
  order: number
}
export interface PackCharacter {
  key: string
  name: string
  aliases: string[]
  tag: string | null
  parent: string | null // base character key (outfit version)
  affiliation: string | null
}
export interface PackSeries {
  name: string
  aliases: string[]
  tag: string | null
  wiki: string | null
  affiliations: PackAffiliation[]
  characters: PackCharacter[]
}
export interface PackFile {
  p: string // relative to the organize folder (or roots[r]), "/" separated
  r?: number
  sha: string
  size: number | null
  rating: string
  rs: string
  score: number | null
  rr: number
  kind: string
  fav: number
  stars: number
  go: number
  gs: number | null // index into series
  aside: number
  classified: boolean
  chars: { c: string | null; st: string; src: string; conf: number | null; bbox: string | null; cand: { c: string; score: number }[] | null }[]
  groups: string[]
}
export interface Pack {
  format: string
  version: number
  app: string
  createdAt: number
  series: PackSeries[]
  groups?: { name: string; order: number }[]
  files?: PackFile[]
  roots?: string[]
}
