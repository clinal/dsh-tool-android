/**
 * Model-facing Android device tools over the `ctx.android` bridge provided by
 * `cordis-plugin-android`. The bridge talks to the cordis-android host socket
 * and is inert outside that host: control calls reject with an explicit error
 * until the instance setting and Shizuku grant are in place.
 * @module dsh-tool-android
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
// Type-only import: pulls the `Context.android` declaration merge and the
// bridge result types into this program.
import type { AndroidBridge, CommandResult } from 'cordis-plugin-android'

export const name = 'tool-android'
export const inject = ['tools']

const CONTROL_REQUIREMENT =
  'Requires Android control enabled in the cordis-android instance settings and Shizuku access.'

/** Output schema shared by every tool whose canonical value is a bridge command result. */
const commandResultSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    stdout: { type: 'string', required: true },
    stderr: { type: 'string', required: true },
    exitCode: { type: 'integer', required: true },
  },
} as const satisfies ValueSchemaSpec

/** Read the bridge service; the android plugin row provides it at root scope. */
function bridge(ctx: Context): AndroidBridge {
  const value = ctx.get('android')
  if (!value) {
    throw new Error('Android bridge is not mounted: add the `cordis-plugin-android` plugin row to the composition')
  }
  return value
}

/** Await a bridge call, settling early when the caller cancels (the bridge has no abort surface). */
function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new Error('Android bridge call cancelled'))
  }
  let rejectCall!: (error: Error) => void
  const aborted = new Promise<never>((_, reject) => {
    rejectCall = reject
  })
  const onAbort = (): void => { rejectCall(new Error('Android bridge call cancelled')) }
  signal.addEventListener('abort', onAbort, { once: true })
  return Promise.race([promise, aborted]).finally(() => {
    signal.removeEventListener('abort', onAbort)
  })
}

/** Model-facing text for a bridge command result, exit code first. */
function renderCommand(value: CommandResult): string {
  const stdout = value.stdout.trim()
  const stderr = value.stderr.trim()
  if (value.exitCode === 0) return stdout ? `exit code 0\n${stdout}` : 'exit code 0'
  return `exit code ${value.exitCode}${stdout ? `\n${stdout}` : ''}${stderr ? `\n${stderr}` : ''}`
}

/** Register the `android_*` tools on `ctx.tools`; disposal unregisters them with the fiber. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'android_status',
    description: 'Check the Android bridge state: whether the cordis-android host socket is connected and which instance this process runs in. Call this before other android_* tools to confirm device control is available.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          connected: { type: 'boolean', required: true },
          protocol: { type: 'string', required: true },
          instanceId: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.connected
          ? `Android bridge connected (instance ${value.instanceId}, protocol ${value.protocol}).`
          : `Android bridge not connected (instance ${value.instanceId}, protocol ${value.protocol}). Device control calls will fail until the host socket reconnects.`,
      }],
    },
    async execute() {
      const [runtime, instance] = await Promise.all([bridge(ctx).runtime(), bridge(ctx).instance()])
      return { connected: runtime.connected, protocol: runtime.protocol, instanceId: instance.id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'android_tap',
    description: `Tap at a screen coordinate on the Android device. Coordinates are screen pixels. ${CONTROL_REQUIREMENT}`,
    parameters: {
      x: { type: 'integer', required: true, description: 'Screen x coordinate in pixels.' },
      y: { type: 'integer', required: true, description: 'Screen y coordinate in pixels.' },
    },
    output: {
      schema: commandResultSchema,
      render: (_args, value) => [{ type: 'text', text: renderCommand(value) }],
    },
    timeoutMs: 30_000,
    async execute(args, exec) {
      return withSignal(bridge(ctx).tap(args.x, args.y), exec.signal)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'android_swipe',
    description: `Swipe from one screen coordinate to another over a duration in milliseconds on the Android device. Coordinates are screen pixels. ${CONTROL_REQUIREMENT}`,
    parameters: {
      x1: { type: 'integer', required: true, description: 'Start screen x coordinate in pixels.' },
      y1: { type: 'integer', required: true, description: 'Start screen y coordinate in pixels.' },
      x2: { type: 'integer', required: true, description: 'End screen x coordinate in pixels.' },
      y2: { type: 'integer', required: true, description: 'End screen y coordinate in pixels.' },
      duration: { type: 'integer', description: 'Swipe duration in milliseconds (default 300).' },
    },
    output: {
      schema: commandResultSchema,
      render: (_args, value) => [{ type: 'text', text: renderCommand(value) }],
    },
    timeoutMs: 30_000,
    async execute(args, exec) {
      return withSignal(bridge(ctx).swipe(args.x1, args.y1, args.x2, args.y2, args.duration), exec.signal)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'android_key',
    description: `Send a key event to the Android device by Android key code, for example 4 for KEYCODE_BACK or 3 for KEYCODE_HOME. ${CONTROL_REQUIREMENT}`,
    parameters: {
      keyCode: { type: 'integer', required: true, description: 'Android key code to send.' },
    },
    output: {
      schema: commandResultSchema,
      render: (_args, value) => [{ type: 'text', text: renderCommand(value) }],
    },
    timeoutMs: 30_000,
    async execute(args, exec) {
      return withSignal(bridge(ctx).key(args.keyCode), exec.signal)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'android_screenshot',
    description: `Capture the current Android screen as a PNG screenshot. The base64 payload is returned in the tool result; the rendered text reports the capture size. ${CONTROL_REQUIREMENT}`,
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          mimeType: { type: 'string', required: true, enum: ['image/png'] },
          base64: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Captured Android screenshot: ${value.mimeType}, ${value.base64.length} base64 characters.`,
      }],
    },
    timeoutMs: 120_000,
    async execute(_args, exec) {
      return withSignal(bridge(ctx).screenshot(), exec.signal)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'android_device_info',
    description: `Read the Android device screen size, density, and current foreground package. ${CONTROL_REQUIREMENT}`,
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          width: { type: 'integer', description: 'Screen width in pixels when available.' },
          height: { type: 'integer', description: 'Screen height in pixels when available.' },
          density: { type: 'integer', description: 'Screen density in dpi when available.' },
          currentPackage: { type: 'string', description: 'Current foreground package when available.' },
        },
      },
      render: (_args, value) => {
        const parts: string[] = []
        if (value.width !== undefined && value.height !== undefined) parts.push(`${value.width}x${value.height}`)
        if (value.density !== undefined) parts.push(`density ${value.density}dpi`)
        if (value.currentPackage !== undefined) parts.push(`foreground package ${value.currentPackage}`)
        return [{ type: 'text', text: parts.length > 0 ? parts.join(', ') : 'No Android device information available.' }]
      },
    },
    timeoutMs: 30_000,
    async execute(_args, exec) {
      // The bridge returns `undefined` entries for unavailable facts; the
      // canonical value must be lossless JSON, so keep only defined entries.
      const info = await withSignal(bridge(ctx).deviceInfo(), exec.signal)
      return {
        ...(info.width !== undefined ? { width: info.width } : {}),
        ...(info.height !== undefined ? { height: info.height } : {}),
        ...(info.density !== undefined ? { density: info.density } : {}),
        ...(info.currentPackage !== undefined ? { currentPackage: info.currentPackage } : {}),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'android_execute',
    description: `Run a shell command on the Android device through the Shizuku shell. Intended for read-only queries such as \`dumpsys\` and \`pm list\`. ${CONTROL_REQUIREMENT}`,
    parameters: {
      command: { type: 'string', required: true, description: 'The shell command to run, for example `dumpsys window displays`.' },
    },
    output: {
      schema: commandResultSchema,
      render: (_args, value) => [{ type: 'text', text: renderCommand(value) }],
    },
    timeoutMs: 60_000,
    async execute(args, exec) {
      return withSignal(bridge(ctx).execute(args.command), exec.signal)
    },
  }))
}
