export interface MediaFile {
  path: string
  name: string
  ext: string
}

export interface Album {
  name: string
  files: MediaFile[]
}

export interface Directory {
  name: string
  path: string
  albums: Album[]
  files: MediaFile[]
}