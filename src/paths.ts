/**
 * Where the data lives.
 *
 * `data/` holds the example walk that ships with the repo. Point HIKE_DATA_DIR
 * at another directory to render your own tracks without touching the example
 * or risking them in a commit:
 *
 *   HIKE_DATA_DIR=data.local pnpm ingest && HIKE_DATA_DIR=data.local pnpm render
 */
export const DATA_DIR = process.env.HIKE_DATA_DIR ?? 'data';
