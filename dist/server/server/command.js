/**
 * Server Command Line Interface
 *
 * Entry point for running the Bolo server from the command line.
 */
// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';
import createBoloApp from './application';
let createBoloIrcClient = null;
try {
    createBoloIrcClient = require('./irc').default;
}
catch (e) {
    // IRC module not available
}
export function run() {
    // FIXME: I want YAML, damnit!
    if (process.argv.length !== 3) {
        console.log('Usage: bolo-server <config.json>');
        console.log('If the file does not exist, a sample will be created.');
        return;
    }
    let content;
    try {
        content = fs.readFileSync(process.argv[2], 'utf-8');
    }
    catch (e) {
        if (e.code !== 'ENOENT') {
            console.log('I was unable to read that file.');
            throw e;
        }
        const samplefile = path.join(path.dirname(fs.realpathSync(__filename)), '../../config.json.sample');
        const sample = fs.readFileSync(samplefile, 'utf-8');
        try {
            fs.writeFileSync(process.argv[2], sample, 'utf-8');
        }
        catch (e2) {
            console.log("Oh snap! I want to create a sample configuration, but can't.");
            throw e2;
        }
        console.log('I created a sample configuration for you.');
        console.log('Please edit the file, then run the same command again.');
        return;
    }
    let config;
    try {
        config = JSON.parse(content);
    }
    catch (e) {
        console.log("I don't understand the contents of that file.");
        throw e;
    }
    // Use PORT environment variable if available (for Railway, Heroku, etc.)
    const port = process.env.PORT ? parseInt(process.env.PORT) : config.web.port;
    const app = createBoloApp(config);
    app.listen(port);
    console.log(`Bolo server listening on port ${port}.`);
    if (config.irc) {
        if (createBoloIrcClient) {
            for (const [link, options] of Object.entries(config.irc)) {
                app.registerIrcClient(createBoloIrcClient(app, options));
            }
        }
        else {
            console.log('Warning: IRC configuration found but irc-js module is not available.');
        }
    }
}
// Run the server when this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    run();
}
//# sourceMappingURL=command.js.map