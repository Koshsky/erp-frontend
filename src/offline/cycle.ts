/**
 * @deprecated The single maintenance cycle moved to ./connection (wired from
 * main.ts via startConnectionMonitor). This file only re-exports what old
 * importers still reference (lastPullAt) so builds do not break while agent A
 * migrates the Sync screen. Remove it once every old import is gone.
 */
export { lastPullAt } from './connection'
