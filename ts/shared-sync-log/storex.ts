import { StorageModule, StorageModuleConfig } from '@worldbrain/storex-pattern-modules'
import { SharedSyncLog, SharedSyncLogEntry, createSharedSyncLogConfig } from './types'

export class SharedSyncLogStorage extends StorageModule implements SharedSyncLog {
    getConfig : () => StorageModuleConfig = () =>
        createSharedSyncLogConfig({
            operations: {
                createDeviceInfo: {
                    operation: 'createObject',
                    collection: 'sharedSyncLogDeviceInfo',
                },
                getDeviceInfo: {
                    operation: 'findObject',
                    collection: 'sharedSyncLogDeviceInfo',
                    args: {id: '$deviceId'}
                },
                updateSharedUntil: {
                    operation: 'updateObjects',
                    collection: 'sharedSyncLogDeviceInfo',
                    args: [{id: '$deviceId'}, {sharedUntil: '$sharedUntil:timestamp'}]
                },

                createLogEntry: {
                    operation: 'createObject',
                    collection: 'sharedSyncLogEntry',
                },
                findUnsyncedEntries: {
                    operation: 'findObjects',
                    collection: 'sharedSyncLogEntry',
                    args: [
                        {sharedOn: {$gt: '$sharedUntil:timestamp'}},
                        {sort: ['sharedOn', 'asc']}
                    ]
                }
            },
        })

    async createDeviceId(options : {userId, sharedUntil : number}) : Promise<string> {
        return (await this.operation('createDeviceInfo', options)).object.id
    }

    async writeEntries(entries : SharedSyncLogEntry[], options : { userId, deviceId }) : Promise<void> {
        for (const entry of entries) {
            await this.operation('createLogEntry', { ...entry, ...options })
        }
    }

    async getUnsyncedEntries(options : { deviceId }) : Promise<SharedSyncLogEntry[]> {
        const deviceInfo = await this.operation('getDeviceInfo', options)
        if (!deviceInfo) {
            return null
        }

        return this.operation('findUnsyncedEntries', { deviceId: options.deviceId, sharedUntil: deviceInfo.sharedUntil })
    }

    async updateSharedUntil(args : {until : number, deviceId}) : Promise<void> {
        await this.operation('updateSharedUntil', { deviceId: args.deviceId, sharedUntil: args.until })
    }
}
