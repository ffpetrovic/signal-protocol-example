import express from 'express';
import expressWs, {Application} from 'express-ws';
import * as websocket from 'ws';

const app: Application = express() as any;
expressWs(app);

// Keys are device specific.
interface KeyBundle {
    identityKey: Array<number>; // Long term EC key (permanent(?)).
    signedPreKey: Array<number>; // Medium term EC key, refreshed periodically.
    preKey: Array<number>; // Short term (ephemeral), one-time use key for establishing a session between two devices.
    // Every time a device asks for another device's keys, a single preKey is returned, but it's also deleted from the database.
    // Therefore, multiple pre-keys are sent at registration time, so this should be `preKeys: Array<Array<number>>`.
    // So a device should periodically check the status of it's own keys (how many pre-keys are left) and replenish them as needed.
}

interface UserInfo {
    registrationId: number; // Property of the device entity, generated client-side and sent during registration.
    deviceId: number; // Property of the device entity, generated client-side and sent during registration.
    bundle: KeyBundle;
}

interface SocketWithUserId extends websocket {
    userId: string;
}

interface SocketEvent {
    event: string;
    data: any;
}

// In-memory data for keeping track of keys and connected sockets.
/*
 * Map<username, UserInfo>, using this approach a user could only have one device.
 * A multi-device approach would be something like `Record<string, UserInfo[]>`.
 */
const keys: Record<string, UserInfo> = {};
// For keeping track of connected sockets, mapped by username. Same as above in regards to the one-device approach.
const sockets: Record<string, websocket> = {};

app.get('/keys/:username', function(req, res, next){
    console.log(`Serving key bundle for ${req.params.username}`);

    res.status(200).json(keys[req.params.username]).end();

    // In a real world application, the fetched preKey would be removed from the database.
});

app.ws('/', function(_ws, req) {
    const ws = _ws as SocketWithUserId;

    ws.on('message', function(msg: any) {
        const parsedMessage: SocketEvent = JSON.parse(msg);

        if(parsedMessage.event === 'set_info') {
            keys[ws.userId] = parsedMessage.data;
            console.log(`Setting bundle for ${ws.userId}`)
        }

        else if (parsedMessage.event === 'message') {
            sockets[parsedMessage.data.userId].send(
                JSON.stringify({
                    event: 'message',
                    data: {
                        userId: ws.userId,
                        deviceId: 1,
                        message: parsedMessage.data.message,
                    },
                } as SocketEvent),
            );

            console.log(`Transferring encrypted message from ${ws.userId} to ${parsedMessage.data.userId} with content: ${msg}`);
        }
    });

    ws.on('close', function close() {
        delete sockets[ws.userId];
        console.log(`User '${ws.userId}' disconnected`);
    });

    ws.userId = req.headers.authorization as string;
    sockets[ws.userId] = ws;
    console.log(`User '${ws.userId}' connected`);
});

app.listen(3000);
