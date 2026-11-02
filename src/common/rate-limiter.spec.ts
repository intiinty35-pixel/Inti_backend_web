import { RateLimiter } from "./rate-limiter";

describe("RateLimiter", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("permite hasta el límite y bloquea el siguiente intento", () => {
    const limiter = new RateLimiter(3, 1000);
    expect([1, 2, 3, 4].map(() => limiter.allow("ip"))).toEqual([true, true, true, false]);
  });

  it("cuenta cada clave por separado", () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("b")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
  });

  it("vuelve a permitir cuando pasa la ventana de tiempo", () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.allow("ip")).toBe(true);
    expect(limiter.allow("ip")).toBe(false);
    jest.advanceTimersByTime(1001);
    expect(limiter.allow("ip")).toBe(true);
  });

  it("los intentos bloqueados no extienden el bloqueo", () => {
    const limiter = new RateLimiter(1, 1000);
    limiter.allow("ip");
    jest.advanceTimersByTime(600);
    expect(limiter.allow("ip")).toBe(false);
    jest.advanceTimersByTime(500);
    expect(limiter.allow("ip")).toBe(true);
  });
});
