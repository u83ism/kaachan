import { Project } from "ts-morph"

export const createMorphProject = (rootDir: string): Project =>
  new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: {
      strict: true,
      baseUrl: rootDir,
    },
  })
