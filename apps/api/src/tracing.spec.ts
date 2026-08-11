const mockStart = jest.fn();
const mockShutdown = jest.fn().mockResolvedValue(undefined);
const mockSdk = jest.fn().mockImplementation(() => ({ start: mockStart, shutdown: mockShutdown }));

jest.mock('@opentelemetry/sdk-node', () => ({ NodeSDK: mockSdk }));
jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({ OTLPTraceExporter: jest.fn().mockImplementation((o) => o) }));
jest.mock('@opentelemetry/instrumentation-http', () => ({ HttpInstrumentation: jest.fn().mockImplementation((o) => o) }));
jest.mock('@opentelemetry/instrumentation-express', () => ({ ExpressInstrumentation: jest.fn() }));
jest.mock('@opentelemetry/instrumentation-ioredis', () => ({ IORedisInstrumentation: jest.fn() }));

// Imported after the mocks are registered. The module self-starts on import;
// with OTEL_EXPORTER_OTLP_ENDPOINT unset (the state under jest) that is a no-op.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { startTracing } = require('./tracing') as typeof import('./tracing');

describe('startTracing', () => {
  const env = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...env };
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });
  afterAll(() => {
    process.env = env;
  });

  it('stays off — and constructs no SDK — when no collector is configured', () => {
    expect(startTracing()).toBe(false);
    expect(mockSdk).not.toHaveBeenCalled();
  });

  it('starts and points the exporter at the collector when configured', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';
    expect(startTracing()).toBe(true);
    expect(mockStart).toHaveBeenCalled();
    expect(mockSdk.mock.calls[0][0]).toMatchObject({
      serviceName: 'afristage-api',
      traceExporter: { url: 'http://collector:4318/v1/traces' }
    });
  });

  it('does not double the slash on a trailing-slash endpoint', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318/';
    startTracing();
    expect(mockSdk.mock.calls[0][0].traceExporter.url).toBe('http://collector:4318/v1/traces');
  });

  it('honours OTEL_SERVICE_NAME', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://c:4318';
    process.env.OTEL_SERVICE_NAME = 'api-staging';
    startTracing();
    expect(mockSdk.mock.calls[0][0].serviceName).toBe('api-staging');
  });

  // The health probe fires continuously; left un-ignored it becomes the bulk of
  // the trace volume and the bill, while carrying no diagnostic value.
  it('ignores health-check traffic but nothing else', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://c:4318';
    startTracing();
    const hook = mockSdk.mock.calls[0][0].instrumentations[0].ignoreIncomingRequestHook;
    expect(hook({ url: '/api/health' })).toBe(true);
    expect(hook({ url: '/api/wallet' })).toBe(false);
    expect(hook({})).toBe(false); // urlless request must not throw
  });

  // Every SIGTERM test runs on fake timers. The handler arms a real 3s fallback
  // timer, and an unref'd timer that outlives the test would fire the REAL
  // process.exit after the spy is restored — which killed a jest worker
  // ("worker process crashed: exitCode=0") with every test still reporting pass.
  describe('shutdown', () => {
    let exit: jest.SpyInstance;
    beforeEach(() => {
      jest.useFakeTimers();
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://c:4318';
      exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    });
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
      exit.mockRestore();
    });

    // Spans buffered at SIGTERM are the ones from the deploy that broke something.
    it('flushes on SIGTERM', async () => {
      startTracing();
      process.emit('SIGTERM' as never);
      await Promise.resolve();
      expect(mockShutdown).toHaveBeenCalled();
    });

    // Registering a SIGTERM listener overrides Node's default terminate-on-SIGTERM,
    // so this handler owns the exit. Without it the process ignores SIGTERM and the
    // platform must SIGKILL it after the grace period — every deploy stalls and
    // in-flight requests are cut. Reproduced against plain node before fixing.
    it('exits after flushing, so SIGTERM still terminates the process', async () => {
      startTracing();
      process.emit('SIGTERM' as never);
      await Promise.resolve();
      await Promise.resolve();
      expect(exit).toHaveBeenCalledWith(0);
    });

    it('exits even when the collector never answers', () => {
      mockShutdown.mockReturnValueOnce(new Promise(() => {})); // never settles
      startTracing();
      process.emit('SIGTERM' as never);
      expect(exit).not.toHaveBeenCalled();
      jest.advanceTimersByTime(3000);
      expect(exit).toHaveBeenCalledWith(0);
    });
  });
});
