# @mi8y/cds-langchain-vectorstore

[![npm version](https://img.shields.io/npm/v/@mi8y/cds-langchain-vectorstore)](https://www.npmjs.com/package/@mi8y/cds-langchain-vectorstore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![monthly downloads](https://img.shields.io/npm/dm/@mi8y/cds-langchain-vectorstore)](https://www.npmjs.com/package/@mi8y/cds-langchain-vectorstore)

## Multi-Tenancy

Multi-tenancy is handled automatically when your CAP application uses `@sap/cds-mtxs`. The plugin's entities are deployed into each tenant's isolated database:

- **SAP HANA** — separate HDI container per tenant
- **SQLite** — separate database file per tenant
- **PostgreSQL** — schema-based isolation

At runtime, CDS routes all checkpoint queries to the correct tenant database based on the active request context. No special plugin configuration is required.

## Supported Databases

Any database with a CAP adapter:

- **SQLite** via `@cap-js/sqlite` (development / testing)
- **SAP HANA** via `@cap-js/hana` (production)
- **PostgreSQL** via `@cap-js/postgres` (production)

## License

[MIT License](./LICENSE)
