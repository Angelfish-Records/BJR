// web/lib/types.ts
export type AlbumInfo = {
  id: string
  title: string
  artist?: string
  year?: number
  description?: string
  artwork?: unknown
}

export type AlbumNavItem = {
  id: string
  slug: string
  title: string
  artist?: string
  coverUrl?: string | null
}
