# Infotex

This project is configured to use [Angular CLI](https://github.com/angular/angular-cli) version 17.3.x.

Before running any of the commands below, install the project dependencies with:

```bash
npm install
```

## Development server

To start a local development server, run the Angular CLI from the project root (`infotex/`):

```bash
cd path/to/infotex
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Troubleshooting

If you see the error `Project "cli" is missing a required property "root"`, double-check that you are running Angular CLI commands from the project root (the folder that contains `angular.json`). Running `ng serve` or other CLI commands from nested folders such as `src/app` will trigger this error because the CLI cannot locate the workspace configuration file from there.