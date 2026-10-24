# sprint

A small CLI for generating Spring Boot projects from the live metadata served by start.spring.io.

Install dependencies:

```bash
bun install
```

Run interactively:

```bash
sprint
```

When choosing dependencies interactively, entries that are incompatible with the
selected Spring Boot version stay visible but are disabled with a message such
as `Requires Spring Boot >= 4.0.0 and < 4.1.0-M1.`.

Or generate a project with Spring Initializr-compatible arguments:

```bash
sprint new demo-app --build maven --language java --dependencies web,data-jpa --java-version 17 --force
```

Equivalent short forms are supported:

```bash
sprint new demo-app -d web,data-jpa -l java -j 17 -f
```

You can also run the script directly:

```bash
bun run src/index.ts new demo-app --dependencies web,data-jpa --force
```

Type check:

```bash
bun check
```

Show CLI version:

```bash
sprint version
```
