import pkg from "../package.json"

type Target = {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}

const allTargets: Target[] = [
  {
    os: "linux",
    arch: "arm64",
  },
  {
    os: "linux",
    arch: "x64",
  },
  {
    os: "linux",
    arch: "x64",
    avx2: false,
  },
  {
    os: "linux",
    arch: "arm64",
    abi: "musl",
  },
  {
    os: "linux",
    arch: "x64",
    abi: "musl",
  },
  {
    os: "linux",
    arch: "x64",
    abi: "musl",
    avx2: false,
  },
  {
    os: "darwin",
    arch: "arm64",
  },
  {
    os: "darwin",
    arch: "x64",
  },
  {
    os: "darwin",
    arch: "x64",
    avx2: false,
  },
  {
    os: "win32",
    arch: "x64",
  },
  {
    os: "win32",
    arch: "x64",
    avx2: false,
  },
]

const singleFlag = process.argv.includes("--single")

export function collectTargets() {
  return singleFlag
    ? allTargets.filter((item) => item.os === process.platform && item.arch === process.arch)
    : allTargets
}

export function collectBinaries(targets: Target[]) {
  return targets.map((item) => {
    const name = [
      pkg.name,
      // changing to win32 flags npm for some reason
      item.os === "win32" ? "windows" : item.os,
      item.arch,
      item.avx2 === false ? "baseline" : undefined,
      item.abi === undefined ? undefined : item.abi,
    ]
      .filter(Boolean)
      .join("-")

    return { name, item }
  })
}
