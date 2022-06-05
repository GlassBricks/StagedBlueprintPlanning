// noinspection JSUnusedGlobalSymbols

interface BlueprintEntity {
  readonly recipe?: string
  readonly override_stack_size?: number
  readonly neighbours?: number[]
  readonly type?: "input" | "output"
}
