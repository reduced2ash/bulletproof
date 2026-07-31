declare module 'fast-speedtest-api' {
  interface SpeedtestOptions {
    token: string;
    verbose?: boolean;
    timeout?: number;
    https?: boolean;
    urlCount?: number;
    bufferSize?: number;
    unit?: string;
  }

  export default class Speedtest {
    static readonly UNITS: {
      readonly Mbps: string;
    };

    constructor(options: SpeedtestOptions);
    getSpeed(): Promise<number>;
  }
}
