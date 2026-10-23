# Spring CLI

```bash
$ spring
usage: spring [--help] [--version]
       <command> [<args>]

Available commands are:

  init [options] [location]
    Initialize a new project using Spring Initializr (start.spring.io)

  encodepassword [options] <password to encode>
    Encode a password for use with Spring Security

  shell
    Start a nested shell

Common options:

  --debug Verbose mode
    Print additional status information for the command you are running


See 'spring help <command>' for more information on a specific command.
```

```bash
$ spring help init
spring init - Initialize a new project using Spring Initializr (start.spring.io)

usage: spring init [options] [location]

Option                       Description
------                       -----------
-a, --artifact-id <String>   Project coordinates; infer archive name (for
                               example 'test')
-b, --boot-version <String>  Spring Boot version (for example '1.2.0.RELEASE')
--build <String>             Build system to use (for example 'maven' or
                               'gradle') (default: maven)
-d, --dependencies <String>  Comma-separated list of dependency identifiers to
                               include in the generated project
--description <String>       Project description
-f, --force                  Force overwrite of existing files
--format <String>            Format of the generated content (for example
                               'build' for a build file, 'project' for a
                               project archive) (default: project)
-g, --group-id <String>      Project coordinates (for example 'org.test')
-j, --java-version <String>  Language level (for example '1.8')
-l, --language <String>      Programming language  (for example 'java')
--list                       List the capabilities of the service. Use it to
                               discover the dependencies and the types that are
                               available
-n, --name <String>          Project name; infer application name
-p, --packaging <String>     Project packaging (for example 'jar')
--package-name <String>      Package name
-t, --type <String>          Project type. Not normally needed if you use --
                               build and/or --format. Check the capabilities of
                               the service (--list) for more details
--target <String>            URL of the service to use (default: https://start.
                               spring.io)
-v, --version <String>       Project version (for example '0.0.1-SNAPSHOT')
-x, --extract                Extract the project archive. Inferred if a
                               location is specified without an extension

examples:

    To list all the capabilities of the service:
        $ spring init --list

    To creates a default project:
        $ spring init

    To create a web my-app.zip:
        $ spring init -d=web my-app.zip

    To create a web/data-jpa gradle project unpacked:
        $ spring init -d=web,jpa --build=gradle my-dir
```

```bash
$ spring version
Spring CLI v4.1.2
```
