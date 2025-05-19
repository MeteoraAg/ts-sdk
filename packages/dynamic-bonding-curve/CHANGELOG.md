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

## [1.1.5] - 2025-05-19

### Release Notes

#### Feature Changes

- feat: removed `buildCurveAndCreateConfig`, `buildCurveAndCreateConfigByMarketCap`, `buildCurveGraphAndCreateConfig` functions
- feat: added `buildCurveWithTwoSegments` and `buildCurveWithCreatorFirstBuy` functions
- fix: update `docs.md` with the latest changes
- feat: added `getPoolByBaseMint` function
- chore: clean up the code
- feat: added `tempWSolAcc` param to `claimCreatorTradingFee` and `claimPartnerTradingFee` functions
- feat: added `calculateInitialPriceFromSqrtStartPrice`, `calculateFeeScheduler` and `calculateLockedVesting` functions
- fix: reduced client-side filtering in `getPoolsQuoteFeesByConfig` and `getPoolsBaseFeesByConfig`

#### Breaking Changes

- `buildCurveAndCreateConfig`, `buildCurveAndCreateConfigByMarketCap`, `buildCurveGraphAndCreateConfig` functions are deprecated. In order to build and create curve config, use the helper functions (`buildCurve`, `buildCurveWithMarketCap`, `buildCurveWithTwoSegments`, `buildCurveWithLiquidityWeights`, `buildCurveWithCreatorFirstBuy`) to build the curve config first before calling `createConfig`.
- `tempWSolAcc` param added to `claimCreatorTradingFee` and `claimPartnerTradingFee` functions. It is required when receiver != creator/feeClaimer.
