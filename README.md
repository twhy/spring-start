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
