/**
 * IRC Bot Integration
 *
 * This mimics basic Jerk functionality, but only accepts commands in channels,
 * and only when the bot is addressed by its nickname. It also automatically reconnects.
 */
interface IRCOptions {
    nick: string;
    channels?: string[];
    admin?: string;
    [key: string]: any;
}
interface Watcher {
    re: RegExp;
    callback: (m: any) => void;
    onlyAdmin?: boolean;
}
interface IRCMessage {
    channel: string;
    text: string;
    person: {
        nick: string;
        user: string;
        host: string;
        ident: string;
    };
    params: string[];
    match_data?: RegExpMatchArray | null;
    say: (text: string) => void;
}
declare class BoloIrc {
    didAddressMe: RegExp;
    watchers: Watcher[];
    client: any;
    shuttingDown: boolean;
    reconnectTimer: NodeJS.Timeout | null;
    options: IRCOptions;
    constructor(options: IRCOptions);
    shutdown(): void;
    watch_for(re: RegExp, callback: (m: IRCMessage) => void): void;
    watch_for_admin(re: RegExp, callback: (m: IRCMessage) => void): void;
}
/**
 * The gist of the IRC functionality we provide.
 */
declare function createBoloIrcClient(app: any, options: IRCOptions): BoloIrc;
export default createBoloIrcClient;
//# sourceMappingURL=irc.d.ts.map