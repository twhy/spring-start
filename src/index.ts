#!/usr/bin/env bun

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import readline, { createInterface } from "node:readline";
import { basename, join } from "node:path";
import { cac } from "cac";
import pc from "picocolors";
import { checkbox, confirm, input, select } from "@inquirer/prompts";

const SPRING_START_ZIP_URL = "https://start.spring.io/starter.zip";
const SPRING_START_METADATA_CLIENT_URL =
  "https://start.spring.io/metadata/client";
const cli = cac("sprint");

const OptionType = {
  SingleSelect: "single-select",
  HierarchicalMultiSelect: "hierarchical-multi-select",
} as const;

type SingleSelect = typeof OptionType.SingleSelect;
type HierarchicalMultiSelect = typeof OptionType.HierarchicalMultiSelect;

type ChoiceValue = {
  id: string;
  name?: string;
  description?: string;
};

type SpringLink = {
  href: string;
  title?: string;
  templated?: boolean;
};

type Dependency = {
  id: string;
  name: string;
  description?: string;
  version?: string;
  versionRange?: string;
  tags?: Record<string, string[]>;
  _links?: Record<string, SpringLink | SpringLink[] | undefined>;
};

type DependencyGroup = {
  name: string;
  values: Dependency[];
};

type SpringMetadata = {
  bootVersion?: {
    type: SingleSelect;
    default?: string;
    values?: ChoiceValue[];
  };
  javaVersion?: {
    default?: string;
    values?: ChoiceValue[];
  };
  language?: {
    default?: string;
    values?: ChoiceValue[];
  };
  packaging?: {
    default?: string;
    values?: ChoiceValue[];
  };
  type?: {
    default?: string;
    values?: ChoiceValue[];
  };
  groupId?: {
    default?: string;
    values?: ChoiceValue[];
  };
  artifactId?: {
    default?: string;
    values?: ChoiceValue[];
  };
  version?: {
    default?: string;
    values?: ChoiceValue[];
  };
  name?: {
    default?: string;
    values?: ChoiceValue[];
  };
  packageName?: {
    default?: string;
    values?: ChoiceValue[];
  };
  dependencies?: {
    type: HierarchicalMultiSelect;
    values: DependencyGroup[];
  };
};

type ProjectOptions = {
  type: string;
  language: string;
  packaging: string;
  bootVersion: string;
  javaVersion: string;
  groupId: string;
  artifactId: string;
  version: string;
  name: string;
  description: string;
  packageName: string;
  dependencies: string[];
};

type CliOptions = {
  artifactId?: string;
  bootVersion?: string;
  build?: string;
  dependencies?: string;
  description?: string;
  force?: boolean;
  format?: string;
  groupId?: string;
  javaVersion?: string;
  language?: string;
  list?: boolean;
  name?: string;
  packaging?: string;
  packageName?: string;
  target?: string;
  type?: string;
  version?: string;
  extract?: boolean;
  interactive?: boolean;
};

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "spring-project"
  );
}

function sanitizePackageSegment(value: string): string {
  return (
    (value || "")
      .trim()
      .replace(/[^a-zA-Z0-9_$]+/g, "")
      .replace(/^[^a-zA-Z_$]+/, "") || "app"
  );
}

function derivePackageName(groupId: string, artifactId: string): string {
  const group = (groupId || "com.example")
    .split(".")
    .map((segment) => sanitizePackageSegment(segment))
    .filter(Boolean)
    .join(".");

  const artifact = sanitizePackageSegment(artifactId || "demo");

  return `${group}.${artifact}`;
}

function printHelp(): void {
  console.log(`Usage:
  sprint new [options] [location]
  sprint --help

Spring init-compatible options:
  -a, --artifact-id <String>   Project coordinates; infer archive name
  -b, --boot-version <String>  Spring Boot version
  --build <String>             Build system to use (maven or gradle)
  -d, --dependencies <String>  Comma-separated dependency identifiers
  --description <String>       Project description
  -f, --force                  Force overwrite of existing files
  --format <String>            project|build (default: project)
  -g, --group-id <String>      Project coordinates
  -j, --java-version <String>  Language level
  -l, --language <String>      Programming language
  --list                      List available capabilities
  -n, --name <String>          Project name
  -p, --packaging <String>     Project packaging (jar|war)
  --package-name <String>      Package name
  -t, --type <String>          Project type
  --target <String>            URL of the service to use
  -v, --version <String>       Project version
  -x, --extract                Extract the project archive
`);
}

async function fetchSpringMetadata(): Promise<SpringMetadata> {
  const response = await fetch(SPRING_START_METADATA_CLIENT_URL);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Spring metadata (${response.status} ${response.statusText})`,
    );
  }

  return (await response.json()) as SpringMetadata;
}

function parseDependencies(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((dependency) => dependency.trim())
    .filter(Boolean);
}

function normalizeVersion(value: string): string {
  return value
    .trim()
    .replace(/^v/i, "")
    .replace(/\.RELEASE$/i, "");
}

function compareVersions(left: string, right: string): number {
  const leftSegments = normalizeVersion(left)
    .split(/[-.]/)
    .map((segment) => Number.parseInt(segment, 10) || 0);
  const rightSegments = normalizeVersion(right)
    .split(/[-.]/)
    .map((segment) => Number.parseInt(segment, 10) || 0);
  const maxLength = Math.max(leftSegments.length, rightSegments.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftSegments[index] ?? 0;
    const rightValue = rightSegments[index] ?? 0;

    if (leftValue < rightValue) {
      return -1;
    }

    if (leftValue > rightValue) {
      return 1;
    }
  }

  return 0;
}

function isDependencyCompatibleWithBootVersion(
  dependency: Dependency,
  bootVersion: string,
): boolean {
  const range = dependency.versionRange?.trim();

  if (!range) {
    return true;
  }

  const normalizedBootVersion = normalizeVersion(bootVersion);

  if (range.startsWith("[") || range.startsWith("(")) {
    const inner = range.slice(1, -1);
    const [lowerBoundRaw, upperBoundRaw] = inner.split(",");
    const lowerBound = lowerBoundRaw
      ? normalizeVersion(lowerBoundRaw)
      : undefined;
    const upperBound = upperBoundRaw
      ? normalizeVersion(upperBoundRaw)
      : undefined;

    if (lowerBound && compareVersions(normalizedBootVersion, lowerBound) < 0) {
      return false;
    }

    if (upperBound && compareVersions(normalizedBootVersion, upperBound) >= 0) {
      return false;
    }

    return true;
  }

  const exactVersion = normalizeVersion(range);
  return (
    compareVersions(normalizedBootVersion, exactVersion) >= 0 ||
    normalizedBootVersion === exactVersion
  );
}

function formatDependencyRequirement(range: string): string {
  const trimmedRange = range.trim();

  if (
    trimmedRange.startsWith("[") ||
    trimmedRange.startsWith("(") ||
    trimmedRange.startsWith("]")
  ) {
    const lowerInclusive = trimmedRange.startsWith("[");
    const upperInclusive = trimmedRange.endsWith("]");
    const inner = trimmedRange.slice(1, -1);
    const [lowerBoundRaw, upperBoundRaw] = inner.split(",");
    const lowerBound = lowerBoundRaw?.trim();
    const upperBound = upperBoundRaw?.trim();
    const constraints: string[] = [];

    if (lowerBound) {
      constraints.push(`${lowerInclusive ? ">=" : ">"} ${lowerBound}`);
    }

    if (upperBound) {
      constraints.push(`${upperInclusive ? "<=" : "<"} ${upperBound}`);
    }

    if (constraints.length > 0) {
      return `Requires Spring Boot ${constraints.join(" and ")}.`;
    }
  }

  return `Requires Spring Boot >= ${trimmedRange}.`;
}

function resolveDefaults(metadata: SpringMetadata): Pick<
  ProjectOptions,
  "type" | "language" | "packaging" | "bootVersion" | "javaVersion"
> & {
  groupId: string;
  artifactId: string;
  version: string;
  name: string;
  packageName: string;
} {
  const type =
    metadata.type?.default ??
    metadata.type?.values?.find(
      (candidate) => candidate.id === "gradle-project",
    )?.id ??
    "gradle-project";
  const language =
    metadata.language?.default ??
    metadata.language?.values?.find((candidate) => candidate.id === "java")
      ?.id ??
    "java";
  const packaging =
    metadata.packaging?.default ??
    metadata.packaging?.values?.find((candidate) => candidate.id === "jar")
      ?.id ??
    "jar";
  const bootVersion =
    metadata.bootVersion?.default ??
    metadata.bootVersion?.values?.find((candidate) => candidate.id === "4.1.2")
      ?.id ??
    "4.1.2";
  const javaVersion =
    metadata.javaVersion?.default ??
    metadata.javaVersion?.values?.find((candidate) => candidate.id === "17")
      ?.id ??
    "17";
  const groupId = metadata.groupId?.default ?? "com.example";
  const artifactId = metadata.artifactId?.default ?? "demo";
  const version = metadata.version?.default ?? "0.0.1-SNAPSHOT";
  const name = metadata.name?.default ?? artifactId;
  const packageName =
    metadata.packageName?.default ??
    derivePackageName(groupId, artifactId || name);

  return {
    type,
    language,
    packaging,
    bootVersion,
    javaVersion,
    groupId,
    artifactId,
    version,
    name,
    packageName,
  };
}

function buildStarterUrl(options: ProjectOptions): string {
  const params = new URLSearchParams({
    type: options.type,
    language: options.language,
    packaging: options.packaging,
    javaVersion: options.javaVersion,
    bootVersion: options.bootVersion,
    groupId: options.groupId,
    artifactId: options.artifactId,
    version: options.version,
    name: options.name,
    description: options.description,
    packageName: options.packageName,
  });

  if (options.dependencies.length > 0) {
    params.set("dependencies", options.dependencies.join(","));
  }

  return `${SPRING_START_ZIP_URL}?${params.toString()}`;
}

function deriveProjectType(
  options: Pick<CliOptions, "build" | "language" | "type">,
): string {
  if (options.type) {
    return options.type;
  }

  const build = options.build ?? "maven";
  const language = options.language ?? "java";

  if (build === "gradle") {
    return language === "kotlin" ? "gradle-project-kotlin" : "gradle-project";
  }

  return "maven-project";
}

async function promptForSelection<T extends string>(
  message: string,
  choices: Array<{ name: string; value: T; description?: string }>,
  defaultValue?: T,
): Promise<T> {
  return await select({
    message,
    choices,
    default: defaultValue,
  });
}

async function promptForDependencyIds(
  metadata: SpringMetadata,
  bootVersion: string,
): Promise<string[]> {
  type DependencyEntryState = Dependency & {
    disabledReason?: string;
  };

  const dependencyGroups = metadata.dependencies?.values ?? [];
  const filteredGroups = dependencyGroups
    .map((group) => ({
      ...group,
      values: group.values.map((entry) => {
        const compatible = isDependencyCompatibleWithBootVersion(
          entry,
          bootVersion,
        );

        return compatible
          ? entry
          : {
              ...entry,
              disabledReason: formatDependencyRequirement(
                entry.versionRange ?? "",
              ),
            };
      }),
    }))
    .filter((group) => group.values.length > 0);

  if (filteredGroups.length === 0) {
    return [];
  }

  const selected = new Set<string>();
  const stdin = process.stdin;
  const stdout = process.stdout;

  if (!stdin.isTTY) {
    const fallbackChoices = filteredGroups.flatMap((group) =>
      group.values.map((entry) => ({
        name: entry.name,
        value: entry.id,
        description: entry.description,
        disabled:
          "disabledReason" in entry && entry.disabledReason
            ? entry.disabledReason
            : undefined,
      })),
    );

    return await checkbox({
      message: "Select dependencies",
      choices: fallbackChoices,
    });
  }

  const rl = createInterface({ input: stdin, output: stdout });
  let currentGroupIndex = 0;
  let currentItemIndex = 0;
  let mode: "groups" | "items" = "groups";

  const emit = () => {
    const clear = "\x1b[2J\x1b[H";
    stdout.write(clear);
    stdout.write("Select dependencies\n\n");

    if (mode === "groups") {
      filteredGroups.forEach((group, index) => {
        const prefix = index === currentGroupIndex ? pc.green("▶") : " ";
        const currentSelections = group.values
          .filter((entry) => selected.has(entry.id))
          .map((entry) => pc.green(entry.name))
          .join(", ");
        stdout.write(
          `${prefix} ${group.name}${currentSelections ? `  (${currentSelections})` : ""}\n`,
        );
      });
      stdout.write(
        `\n${pc.dim("Right arrow / Enter: open group  •  d / Ctrl+D: done  •  ↑/↓: move")}\n`,
      );
      return;
    }

    const group = filteredGroups[currentGroupIndex]!;
    const selectedNames = group.values
      .filter((entry) => selected.has(entry.id))
      .map((entry) => pc.green(entry.name));

    stdout.write(
      `${group.name}${selectedNames.length ? `  (${selectedNames.join(", ")})` : ""}\n\n`,
    );
    stdout.write(
      `${pc.dim("Left arrow / Esc: back  •  Space: toggle  •  d / Ctrl+D: done  •  Enter: keep browsing")}\n\n`,
    );

    group.values.forEach((entry, index) => {
      const isActive = index === currentItemIndex;
      const disabledReason =
        "disabledReason" in entry ? entry.disabledReason : undefined;
      const isDisabled = Boolean(disabledReason);
      const isSelected = selected.has(entry.id);
      const marker = isSelected
        ? pc.green("◉")
        : isDisabled
          ? pc.dim("◌")
          : isActive
            ? pc.cyan("◌")
            : "○";
      const prefix = isActive ? pc.green("▶") : " ";
      const label = isDisabled
        ? pc.dim(entry.name)
        : isSelected
          ? pc.green(entry.name)
          : entry.name;
      const requirement = disabledReason
        ? pc.dim(` — ${disabledReason}`)
        : "";
      const description = entry.description
        ? pc.dim(` — ${entry.description}`)
        : "";
      stdout.write(`${prefix} ${marker} ${label}${description}${requirement}\n`);
    });
  };

  const toggleCurrent = () => {
    const currentGroup = filteredGroups[currentGroupIndex]!;
    const currentEntry = currentGroup.values[currentItemIndex] as
      | DependencyEntryState
      | undefined;

    if (!currentEntry || currentEntry.disabledReason) {
      return;
    }

    if (selected.has(currentEntry.id)) {
      selected.delete(currentEntry.id);
    } else {
      selected.add(currentEntry.id);
    }
  };

  try {
    stdin.setRawMode(true);
    readline.emitKeypressEvents(stdin);

    const waitForKey = () =>
      new Promise<{ name?: string }>((resolve) => {
        const handler = (_: string, key: { name?: string }) => {
          stdin.off("keypress", handler);
          resolve(key);
        };

        stdin.on("keypress", handler);
      });

    while (true) {
      emit();
      const key = await waitForKey();
      const name = key.name ?? "";

      if (mode === "groups") {
        if (name === "up" || name === "k") {
          currentGroupIndex =
            (currentGroupIndex - 1 + filteredGroups.length) %
            filteredGroups.length;
        } else if (name === "down" || name === "j") {
          currentGroupIndex = (currentGroupIndex + 1) % filteredGroups.length;
        } else if (name === "right" || name === "return") {
          mode = "items";
          currentItemIndex = 0;
        } else if (name === "d" || name === "ctrl+d") {
          break;
        } else if (name === "q" || name === "escape") {
          break;
        }
        continue;
      }

      if (name === "left" || name === "escape") {
        mode = "groups";
      } else if (name === "up" || name === "k") {
        currentItemIndex =
          (currentItemIndex -
            1 +
            filteredGroups[currentGroupIndex]!.values.length) %
          filteredGroups[currentGroupIndex]!.values.length;
      } else if (name === "down" || name === "j") {
        currentItemIndex =
          (currentItemIndex + 1) %
          filteredGroups[currentGroupIndex]!.values.length;
      } else if (name === "space") {
        toggleCurrent();
      } else if (name === "return") {
        toggleCurrent();
      } else if (name === "d" || name === "ctrl+d") {
        break;
      } else if (name === "q") {
        mode = "groups";
      }
    }
  } finally {
    stdin.setRawMode(false);
    rl.close();
    stdout.write("\x1b[2J\x1b[H");
  }

  return Array.from(selected);
}

async function resolveProjectOptions(
  metadata: SpringMetadata,
  location: string | undefined,
  provided: CliOptions,
): Promise<ProjectOptions> {
  const defaults = resolveDefaults(metadata);
  const fallbackLocationName = location
    ? basename(location).replace(/\.[a-z0-9]+$/i, "") || defaults.artifactId
    : defaults.artifactId;

  const projectTypeOptions = [
    { name: "Gradle - Groovy", value: "gradle-project" },
    { name: "Gradle - Kotlin", value: "gradle-project-kotlin" },
    { name: "Maven", value: "maven-project" },
  ];

  const type =
    provided.type ??
    (await promptForSelection("Project", projectTypeOptions, defaults.type));

  const language =
    provided.language ??
    (await promptForSelection(
      "Language",
      (metadata.language?.values ?? [{ id: "java", name: "Java" }]).map(
        (entry) => ({
          name: entry.name ?? entry.id,
          value: entry.id,
        }),
      ),
      defaults.language,
    ));

  const bootVersion =
    provided.bootVersion ??
    (await promptForSelection(
      "Spring Boot",
      (metadata.bootVersion?.values ?? [{ id: "4.1.2", name: "4.1.2" }]).map(
        (entry) => ({
          name: entry.name ?? entry.id,
          value: entry.id,
        }),
      ),
      defaults.bootVersion,
    ));

  const groupId =
    provided.groupId ??
    (await input({ message: "Group", default: defaults.groupId }));
  const artifactId =
    provided.artifactId ??
    (await input({ message: "Artifact", default: fallbackLocationName }));
  const packageDefault = derivePackageName(groupId, artifactId);
  const packageName =
    provided.packageName ??
    (await input({
      message: "Package name",
      default: packageDefault,
    }));

  const packaging =
    provided.packaging ??
    (await promptForSelection(
      "Packaging",
      (metadata.packaging?.values ?? [{ id: "jar", name: "Jar" }]).map(
        (entry) => ({
          name: entry.name ?? entry.id,
          value: entry.id,
        }),
      ),
      defaults.packaging,
    ));

  const javaVersion =
    provided.javaVersion ??
    (await promptForSelection(
      "Java",
      (metadata.javaVersion?.values ?? [{ id: "17", name: "17" }]).map(
        (entry) => ({
          name: entry.name ?? entry.id,
          value: entry.id,
        }),
      ),
      defaults.javaVersion,
    ));

  const projectName = provided.name ?? artifactId;
  const version = provided.version ?? defaults.version;
  const description =
    provided.description ?? `${projectName} generated by sprint`;
  const bootVersionValue =
    bootVersion || provided.bootVersion || defaults.bootVersion;
  const dependencies =
    provided.dependencies !== undefined
      ? parseDependencies(provided.dependencies)
      : await promptForDependencyIds(metadata, bootVersionValue);

  return {
    type: type || provided.type || defaults.type,
    language,
    packaging: packaging || provided.packaging || defaults.packaging,
    bootVersion: bootVersionValue,
    javaVersion: javaVersion || provided.javaVersion || defaults.javaVersion,
    groupId,
    artifactId,
    version,
    name: projectName,
    description,
    packageName,
    dependencies,
  };
}

async function fetchProjectArchive(options: ProjectOptions): Promise<Response> {
  const starterUrl = buildStarterUrl(options);
  const response = await fetch(starterUrl);

  if (response.ok) {
    return response;
  }

  if (
    options.type.startsWith("gradle") &&
    options.bootVersion.endsWith(".RELEASE")
  ) {
    const retryOptions = {
      ...options,
      bootVersion: options.bootVersion.replace(/\.RELEASE$/, ""),
    };
    const retryUrl = buildStarterUrl(retryOptions);
    const retryResponse = await fetch(retryUrl);

    if (retryResponse.ok) {
      return retryResponse;
    }

    throw new Error(
      `Failed to create project (${retryResponse.status} ${retryResponse.statusText})`,
    );
  }

  throw new Error(
    `Failed to create project (${response.status} ${response.statusText})`,
  );
}

async function generateProjectArchive(options: ProjectOptions): Promise<void> {
  const starterUrl = buildStarterUrl(options);
  const response = await fetchProjectArchive(options);

  const projectDir = join(process.cwd(), options.artifactId);
  const zipPath = join(process.cwd(), `${options.artifactId}.zip`);
  const zipBuffer = Buffer.from(await response.arrayBuffer());

  const shouldOverwrite =
    process.argv.includes("--force") || process.argv.includes("-f");

  if (existsSync(projectDir) && !shouldOverwrite) {
    throw new Error(
      `Directory "${projectDir}" already exists. Re-run with --force to overwrite it.`,
    );
  }

  if (existsSync(projectDir)) {
    rmSync(projectDir, { recursive: true, force: true });
  }

  mkdirSync(projectDir, { recursive: true });
  writeFileSync(zipPath, zipBuffer);

  const unzip = Bun.spawn(["unzip", "-q", "-o", zipPath, "-d", projectDir], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await unzip.exited;
  const errorOutput = await new Response(unzip.stderr).text();

  rmSync(zipPath, { force: true });

  if (exitCode !== 0) {
    rmSync(projectDir, { recursive: true, force: true });
    throw new Error(
      `Unable to unpack the project archive: ${errorOutput || "unknown error"}`,
    );
  }

  console.log(`Created Spring project at ${projectDir}`);
}

async function printCapabilities(metadata: SpringMetadata): Promise<void> {
  const dependencyGroups = metadata.dependencies?.values ?? [];

  console.log("Available capabilities:");
  console.log("Builds: maven, gradle");
  console.log(
    "Languages:",
    (metadata.language?.values ?? []).map((entry) => entry.id).join(", "),
  );
  console.log(
    "Packaging:",
    (metadata.packaging?.values ?? []).map((entry) => entry.id).join(", "),
  );

  for (const group of dependencyGroups) {
    console.log(`\n${group.name}:`);
    for (const dependency of group.values) {
      console.log(`  - ${dependency.id}: ${dependency.name}`);
    }
  }
}

function printSelectedOptions(
  metadata: SpringMetadata,
  options: ProjectOptions,
  projectDir: string,
): void {
  const dependencyNameById = new Map<string, string>();

  for (const group of metadata.dependencies?.values ?? []) {
    for (const dependency of group.values) {
      dependencyNameById.set(dependency.id, dependency.name);
    }
  }

  const dependencySummary =
    options.dependencies.length > 0
      ? options.dependencies
          .map((dependencyId) => {
            const dependencyName = dependencyNameById.get(dependencyId);
            return dependencyName
              ? `${dependencyName} (${dependencyId})`
              : dependencyId;
          })
          .join(", ")
      : "(none)";

  console.log("Selected options:");
  console.log(`  Project type: ${options.type}`);
  console.log(`  Language: ${options.language}`);
  console.log(`  Spring Boot: ${options.bootVersion}`);
  console.log(`  Group: ${options.groupId}`);
  console.log(`  Artifact: ${options.artifactId}`);
  console.log(`  Name: ${options.name}`);
  console.log(`  Description: ${options.description}`);
  console.log(`  Package name: ${options.packageName}`);
  console.log(`  Packaging: ${options.packaging}`);
  console.log(`  Java version: ${options.javaVersion}`);
  console.log(`  Version: ${options.version}`);
  console.log(`  Dependencies: ${dependencySummary}`);
  console.log(`  Output directory: ${projectDir}`);
  console.log("");
}

async function runNewCommand(
  location: string | undefined,
  opts: CliOptions,
): Promise<void> {
  const metadata = await fetchSpringMetadata();

  if (opts.list) {
    await printCapabilities(metadata);
    return;
  }

  const shouldPrompt =
    !location &&
    !opts.name &&
    !opts.artifactId &&
    !opts.bootVersion &&
    !opts.javaVersion &&
    !opts.language &&
    !opts.packaging &&
    !opts.type &&
    !opts.dependencies &&
    !opts.groupId &&
    !opts.version &&
    !opts.packageName &&
    !opts.description &&
    !opts.build;

  const defaults = resolveDefaults(metadata);
  const defaultName = location
    ? basename(location).replace(/\.[a-z0-9]+$/i, "") || defaults.artifactId
    : defaults.artifactId;
  const fallbackBase = opts.name ?? opts.artifactId ?? defaultName;
  const effectiveGroupId = opts.groupId ?? defaults.groupId;
  const effectiveArtifactId = opts.artifactId ?? defaultName;
  const effectivePackageName =
    opts.packageName ??
    derivePackageName(effectiveGroupId, effectiveArtifactId);

  const resolvedOptions = shouldPrompt
    ? await resolveProjectOptions(metadata, location, opts)
    : {
        ...defaults,
        type: deriveProjectType({
          build:
            opts.build ??
            (defaults.type.startsWith("gradle") ? "gradle" : "maven"),
          language: opts.language ?? defaults.language,
          type: opts.type,
        }),
        language: opts.language ?? defaults.language,
        packaging: opts.packaging ?? defaults.packaging,
        bootVersion: opts.bootVersion ?? defaults.bootVersion,
        javaVersion: opts.javaVersion ?? defaults.javaVersion,
        groupId: effectiveGroupId,
        artifactId: effectiveArtifactId,
        version: opts.version ?? defaults.version,
        name: opts.name ?? defaultName,
        description: opts.description ?? `${fallbackBase} generated by sprint`,
        packageName: effectivePackageName,
        dependencies: parseDependencies(opts.dependencies),
      };

  const projectName = resolvedOptions.name || resolvedOptions.artifactId;
  const projectDir = join(process.cwd(), resolvedOptions.artifactId);

  if (existsSync(projectDir) && !opts.force) {
    throw new Error(
      `Directory "${projectDir}" already exists. Re-run with --force to overwrite it.`,
    );
  }

  if (opts.force) {
    resolvedOptions.dependencies = resolvedOptions.dependencies;
  }

  printSelectedOptions(metadata, resolvedOptions, projectDir);

  const confirmed = await confirm({
    message: `Create project "${resolvedOptions.artifactId}" in ${process.cwd()}?`,
    default: true,
  });

  if (!confirmed) {
    console.log("Project creation cancelled.");
    return;
  }

  await generateProjectArchive({
    ...resolvedOptions,
    artifactId: resolvedOptions.artifactId || projectName,
    name: projectName,
  });
}

cli
  .command("new [location]", "Initialize a new project using Spring Initializr")
  .option(
    "-a, --artifact-id <string>",
    "Project coordinates; infer archive name",
  )
  .option("-b, --boot-version <string>", "Spring Boot version")
  .option("--build <string>", "Build system to use (maven or gradle)")
  .option(
    "-d, --dependencies <string>",
    "Comma-separated dependency identifiers",
  )
  .option("--description <string>", "Project description")
  .option("-f, --force", "Force overwrite of existing files")
  .option("--format <string>", "project|build")
  .option("-g, --group-id <string>", "Project coordinates")
  .option("-j, --java-version <string>", "Language level")
  .option("-l, --language <string>", "Programming language")
  .option("--list", "List available capabilities")
  .option("-n, --name <string>", "Project name")
  .option("-p, --packaging <string>", "Project packaging (jar|war)")
  .option("--package-name <string>", "Package name")
  .option("-t, --type <string>", "Project type")
  .option("--target <string>", "URL of the service to use")
  .option("-v, --version <string>", "Project version")
  .option("-x, --extract", "Extract the project archive")
  .action(async (location: string | undefined, options: CliOptions) => {
    await runNewCommand(location, options);
  });

const args = process.argv.slice(2);

if (args.length === 0) {
  const metadata = await fetchSpringMetadata();
  const options = await resolveProjectOptions(metadata, undefined, {});
  await generateProjectArchive(options);
} else if (args.some((arg) => arg === "--help" || arg === "-h")) {
  printHelp();
} else {
  cli.parse();
}
