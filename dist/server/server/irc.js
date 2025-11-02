/**
 * IRC Bot Integration
 *
 * This mimics basic Jerk functionality, but only accepts commands in channels,
 * and only when the bot is addressed by its nickname. It also automatically reconnects.
 */
import * as fs from 'fs';
// Note: irc-js is an optional dependency, so we import it dynamically
let IRC;
try {
    IRC = require('irc-js');
}
catch (e) {
    // Module not available
}
class BoloIrc {
    constructor(options) {
        this.watchers = [];
        this.shuttingDown = false;
        this.reconnectTimer = null;
        this.options = options;
        this.didAddressMe = new RegExp(`^${options.nick}[:, ]+(.+?)\\s*$`, 'i');
        this.watchers = [];
        if (!IRC) {
            throw new Error('irc-js module is not available');
        }
        this.client = new IRC(options);
        if (options.channels?.length) {
            this.client.addListener('connected', () => {
                this.client.join(options.channels.join(','));
            });
        }
        this.client.addListener('privmsg', (m) => {
            if ((m.channel = m.params[0]).charAt(0) !== '#')
                return;
            const completeText = m.params[m.params.length - 1];
            const match = this.didAddressMe.exec(completeText);
            if (!match)
                return;
            m.text = match[1];
            m.person.ident = `${m.person.user}@${m.person.host}`;
            m.say = (text) => {
                this.client.privmsg(m.channel, `${m.person.nick}: ${text}`, true);
            };
            for (const watcher of this.watchers) {
                m.match_data = m.text.match(watcher.re);
                if (m.match_data) {
                    if (watcher.onlyAdmin && m.person.ident !== options.admin) {
                        m.say("I can't let you do that.");
                    }
                    else {
                        watcher.callback(m);
                    }
                    break;
                }
            }
        });
        this.client.addListener('disconnected', () => {
            if (this.shuttingDown)
                return;
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.client.connect();
            }, 10000);
        });
        this.client.connect();
    }
    shutdown() {
        this.shuttingDown = true;
        this.client.quit('Augh, they got me!');
    }
    watch_for(re, callback) {
        this.watchers.push({ re, callback });
    }
    watch_for_admin(re, callback) {
        this.watchers.push({ re, callback, onlyAdmin: true });
    }
}
/**
 * The gist of the IRC functionality we provide.
 */
function createBoloIrcClient(app, options) {
    const irc = new BoloIrc(options);
    const findHisGame = (ident) => {
        for (const [gid, game] of Object.entries(app.games)) {
            if (game.owner === ident)
                return game;
        }
        return null;
    };
    irc.watch_for(/^map\s+(.+?)$/, (m) => {
        if (findHisGame(m.person.ident)) {
            return m.say('You already have a game open.');
        }
        if (!app.haveOpenSlots()) {
            return m.say('All game slots are full at the moment.');
        }
        const matches = app.maps.fuzzy(m.match_data[1]);
        if (matches.length === 1) {
            const [descr] = matches;
            fs.readFile(descr.path, (err, data) => {
                if (err) {
                    return m.say('Having some trouble loading that map, sorry.');
                }
                const game = app.createGame(data);
                game.owner = m.person.ident;
                m.say(`Started game "${descr.name}" at: ${game.url}`);
            });
        }
        else if (matches.length === 0) {
            m.say("I can't find any map like that.");
        }
        else if (matches.length > 4) {
            m.say('You need to be a bit more specific than that.');
        }
        else {
            const names = matches.map((descr) => `"${descr.name}"`);
            m.say(`Did you mean one of these: ${names.join(', ')}`);
        }
    });
    irc.watch_for(/^close$/, (m) => {
        const game = findHisGame(m.person.ident);
        if (!game) {
            return m.say("You don't have a game open.");
        }
        app.closeGame(game);
        m.say('Your game was closed.');
    });
    irc.watch_for_admin(/^reindex$/, (m) => {
        app.maps.reindex(() => {
            m.say('Index rebuilt.');
        });
    });
    irc.watch_for_admin(/^reset demo$/, (m) => {
        app.resetDemo((err) => {
            m.say(err || 'Demo game reset.');
        });
    });
    irc.watch_for_admin(/^shutdown$/, (m) => {
        app.shutdown();
    });
    return irc;
}
export default createBoloIrcClient;
//# sourceMappingURL=irc.js.map