type ProtocolConfig = {
    [chain: string]: {
        [key: string]: any;
    };
};
export declare const protocols: ProtocolConfig;
export type ProtocolName = keyof typeof protocols;
export {};
