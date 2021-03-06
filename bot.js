/**
 * A Reddit bot to automatically post CS:GO game information
 * Copyright (C) 2016 Andrew Dassonville
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var cluster = require('cluster');
var LiveGames = require('hltv-live-games');
var HLTVBot = require('./lib/');

var AccountRotation = require('./lib/utils/AccountRotation');

var options = require('./options.json');

var lg = new LiveGames({
    pollTime: 10000
});

var accounts = new AccountRotation(options.accounts, 60000);

var clusterMap = {};
var disconnected = {};

if (cluster.isMaster) {
    lg.on('newGame', function(game) {
        console.log('new game');
        console.log(game);

        var worker = cluster.fork();

        clusterMap[worker.id] = game;
    });

    cluster.on('online', function(worker) {
        console.log('Worker is now online');

        cluster.workers[worker.id].on('message', function(data) {
            console.log('got message', data);

            if (data.type === 'disconnect') {
                disconnected[worker.id] = true;
            }
        });

        worker.send({
            type: 'start',
            data: {
                account: accounts.getAccount(),
                accounts: options.accounts,
                oauth: options.OAuth2,
                debug: options.debug,
                game: clusterMap[worker.id]
            }
        });
    });

    cluster.on('exit', function(worker, code, signal) {
        if (disconnected[worker.id]) {
            delete disconnected[worker.id];
        } else {
            console.log('Worker died with code: ' + code + ', and signal: ' + signal);
            console.log('Starting a new worker');

            var newWorker = cluster.fork();

            clusterMap[newWorker.id] = clusterMap[worker.id];
            delete clusterMap[worker.id];
        }
    });
} else {
    process.on('message', function(message) {
        if (message.type === 'start') {
            var bot = new HLTVBot(message.data);

            bot.start();
        }
    });
}
