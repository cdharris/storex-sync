import * as expect from 'expect'
import { ClientSyncLogEntry } from './types';
import { reconcileSyncLog, ExecutableOperation } from './reconciliation';

function test({logEntries, expectedOperations} : {logEntries : ClientSyncLogEntry[], expectedOperations? : ExecutableOperation[]}) {
    const reconciled = reconcileSyncLog(logEntries)
    if (expectedOperations) {
        expect(reconciled).toEqual(expectedOperations)
    }
}

describe('Reconciliation', () => {
    it('should choose the newest write when finding two entries for the same object field', () => {
        const logEntries : ClientSyncLogEntry[] = [
            {operation: 'modify', createdOn: 2, syncedOn: null, collection: 'lists', pk: 'list-one', field: 'title', value: 'second'},
            {operation: 'modify', createdOn: 1, syncedOn: null, collection: 'lists', pk: 'list-one', field: 'title', value: 'first'},
        ]

        test({logEntries, expectedOperations: [
            {operation: 'updateOneObject', collection: 'lists', args: [{pk: 'list-one'}, {title: 'second'}]}
        ]})
    })

    it('should choose the newest write when finding more than two entries for the same object field', () => {
        const logEntries : ClientSyncLogEntry[] = [
            {operation: 'modify', createdOn: 2, syncedOn: null, collection: 'lists', pk: 'list-one', field: 'title', value: 'second'},
            {operation: 'modify', createdOn: 3, syncedOn: null, collection: 'lists', pk: 'list-one', field: 'title', value: 'third'},
            {operation: 'modify', createdOn: 1, syncedOn: null, collection: 'lists', pk: 'list-one', field: 'title', value: 'first'},
        ]

        test({logEntries, expectedOperations: [
            {operation: 'updateOneObject', collection: 'lists', args: [{pk: 'list-one'}, {title: 'third'}]}
        ]})
    })

    it('should ignore writes to an object that needs deletion', () => {
        const logEntries : ClientSyncLogEntry[] = [
            {operation: 'modify', createdOn: 2, syncedOn: null, collection: 'lists', pk: 'list-one', field: 'title', value: 'second'},
            {operation: 'delete', createdOn: 1, syncedOn: null, collection: 'lists', pk: 'list-one'},
        ]

        test({logEntries, expectedOperations: [
            {operation: 'deleteOneObject', collection: 'lists', args: [{pk: 'list-one'}]}
        ]})
    })

    it('should ignore writes to an already deleted object', () => {
        const logEntries : ClientSyncLogEntry[] = [
            {operation: 'modify', createdOn: 2, syncedOn: null, collection: 'lists', pk: 'list-one', field: 'title', value: 'second'},
            {operation: 'delete', createdOn: 4, syncedOn: 3, collection: 'lists', pk: 'list-one'},
            {operation: 'delete', createdOn: 1, syncedOn: 3, collection: 'lists', pk: 'list-one'},
        ]

        test({logEntries, expectedOperations: []})
    })

    it('should work with only one delete', () => {
        const logEntries : ClientSyncLogEntry[] = [
            {operation: 'delete', createdOn: 1, syncedOn: null, collection: 'lists', pk: 'list-one'},
        ]

        test({logEntries, expectedOperations:  [
            {operation: 'deleteOneObject', collection: 'lists', args: [{pk: 'list-one'}]}
        ]})
    })

    it('should ignore double deletes', () => {
        const logEntries : ClientSyncLogEntry[] = [
            {operation: 'delete', createdOn: 4, syncedOn: null, collection: 'lists', pk: 'list-one'},
            {operation: 'delete', createdOn: 1, syncedOn: null, collection: 'lists', pk: 'list-one'},
        ]

        test({logEntries, expectedOperations: [
            {operation: 'deleteOneObject', collection: 'lists', args: [{pk: 'list-one'}]}
        ]})
    })

    it('should work with deletes having compound keys', () => {
        const logEntries : ClientSyncLogEntry[] = [
            {operation: 'delete', createdOn: 4, syncedOn: null, collection: 'listEntry', pk: ['list-one', 3]},
        ]

        test({logEntries, expectedOperations: [
            {operation: 'deleteOneObject', collection: 'listEntry', args: [{pk: ['list-one', 3]}]}
        ]})
    })

    it('should ignore writes that are already synced', () => {
        const logEntries : ClientSyncLogEntry[] = [
            {operation: 'modify', createdOn: 1, syncedOn: null, collection: 'lists', pk: 'list-one', field: 'title', value: 'second'},
            {operation: 'modify', createdOn: 2, syncedOn: 3, collection: 'lists', pk: 'list-one', field: 'title', value: 'second'},
        ]

        test({logEntries, expectedOperations: []})
    })

    it('should create objects', () => {
        const logEntries : ClientSyncLogEntry[] = [
            {operation: 'create', createdOn: 1, syncedOn: null, collection: 'lists', pk: 'list-one', value: {pk: 'list-one', title: 'first'}}
        ]

        test({logEntries, expectedOperations: [
            {operation: 'createObject', collection: 'lists', args: [{pk: 'list-one', title: 'first'}]}
        ]})
    })
    
    it('should consolidate object creation with object updates', () => {
        const logEntries : ClientSyncLogEntry[] = [
            {operation: 'modify', createdOn: 2, syncedOn: null, collection: 'lists', pk: 'list-one', field: 'title', value: 'second'},
            {operation: 'create', createdOn: 1, syncedOn: null, collection: 'lists', pk: 'list-one', value: {pk: 'list-one', title: 'first', prio: 5}},
        ]

        test({logEntries, expectedOperations: [
            {operation: 'createObject', collection: 'lists', args: [{pk: 'list-one', title: 'second', prio: 5}]}
        ]})
    })
    
    it('should consolidate object creation with object deletion', () => {
        const logEntries : ClientSyncLogEntry[] = [
            {operation: 'modify', createdOn: 2, syncedOn: null, collection: 'lists', pk: 'list-one', field: 'title', value: 'second'},
            {operation: 'create', createdOn: 1, syncedOn: null, collection: 'lists', pk: 'list-one', value: {pk: 'list-one', title: 'first', prio: 5}},
            {operation: 'delete', createdOn: 3, syncedOn: null, collection: 'lists', pk: 'list-one'},
        ]

        test({logEntries, expectedOperations: []})
    })

    it('should complain about double creates', () => {
        const logEntries : ClientSyncLogEntry[] = [
            {operation: 'create', createdOn: 1, syncedOn: 1, collection: 'lists', pk: 'list-one', value: {pk: 'list-one', title: 'first', prio: 5}},
            {operation: 'create', createdOn: 2, syncedOn: null, collection: 'lists', pk: 'list-one', value: {pk: 'list-one', title: 'first', prio: 5}},
        ]
        
        expect(() => test({logEntries})).toThrow(`Detected double create in collection 'lists', pk '"list-one"'`)
    })

    it('should complain about modifications made to an object before creation')
})