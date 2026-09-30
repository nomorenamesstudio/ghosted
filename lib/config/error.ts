/**
 * One error type for environment problems, so every check collects *all* the
 * problems it can see and the operator fixes them in one restart instead of one
 * variable per restart.
 *
 * Lives in its own module because both the deployment flags and the email
 * transport raise it, and those two must not import each other.
 */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join("\n  - ")}`);
    this.name = "ConfigError";
  }
}
