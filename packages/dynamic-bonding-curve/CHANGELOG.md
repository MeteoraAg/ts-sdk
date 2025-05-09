# Changelog

## [1.1.2] - 2025-04-30

### Release Notes

#### Feature Changes

- feat: added 4% and 6% graduation fee options
- feat: creatorWithdrawSurplus and claimCreatorTradingFee functions
- feat: added new getter functions
- feat: refactor SDK to be more modular and optimise RPC calls
- feat: added `createPoolAndBuy` function
- fix: updated the way the services are called
- fix: updated the way the getters are called

#### Breaking Changes

- `createConfig`, `buildCurveAndCreateConfig` and `buildCurveAndCreateConfigByMarketCap` functions now require a `creatorTradingFeePercentage` parameter.
- IDL includes `creatorWithdrawSurplus` and `claimCreatorTradingFee` instructions.
- Partner, Migration, Creator, Pool and State functions are now called in this manner:
    - `client.partners.createConfig` -> `client.partner.createConfig`
    - `client.migrations.migrateToDammV1` -> `client.migration.migrateToDammV1`
    - `client.creators.createPoolMetadata` -> `client.creator.createPoolMetadata`
    - `client.pools.swap` -> `client.pool.swap`
    - `client.getProgram().getPoolConfig` -> `client.state.getPoolConfig`
- In order to get the DBC Pool Address, or DAMM V1 Pool Address, or DAMM V2 Pool Address, use the following functions (the order matters):
    - `deriveDbcPoolAddress`
    - `deriveDammV1PoolAddress`
    - `deriveDammV2PoolAddress`

---

## [1.1.3] - 2025-05-07

### Release Notes

#### Feature Changes

- fix: updated `buildCurveGraphAndCreateConfig` to use `liquidityWeights[]` instead of `kFactor`
- fix: added payer option to `claimCreatorTradingFee` and `claimPartnerTradingFee` functions
- fix: updated dynamic fee calculation to be 20% of minimum base fee
- fix: changed `createPoolAndBuy` buyer from `payer` to `poolCreator`

---

## [1.1.4] - 2025-05-09

### Release Notes

#### Feature Changes

- feat: added `buildCurveGraphAndCreateConfig` function
- feat: added `leftover` parameter to `buildCurveAndCreateConfig` and `buildCurveAndCreateConfigByMarketCap` functions

#### Breaking Changes

- `buildCurveAndCreateConfig` and `buildCurveAndCreateConfigByMarketCap` functions now require a `leftover` parameter.
- `buildCurveGraphAndCreateConfig` uses liquidityWeights[] instead of kFactor now.
- Added receiver option in `claimPartnerTradingFee` and `claimCreatorTradingFee`
