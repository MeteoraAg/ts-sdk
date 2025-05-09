# Changelog

All notable changes to the Dynamic Bonding Curve SDK will be documented in this file.

## [1.1.5] - 2025-05-23

### Added

- `createConfigAndPool` function

### Changed 

- `docs.md` updated with the correct createPool format
- `CHANGELOG.md` switched to DES format

## [1.1.4] - 2025-05-09

### Added

- New function: `buildCurveGraphAndCreateConfig`
- Added `leftover` parameter to curve building functions

### Changed

- Updated fee claiming functions to support custom receivers

### Breaking Changes

- `buildCurveAndCreateConfig` and `buildCurveAndCreateConfigByMarketCap` now require `leftover` parameter
- `buildCurveGraphAndCreateConfig` uses `liquidityWeights[]` instead of `kFactor`
- Added receiver option in `claimPartnerTradingFee` and `claimCreatorTradingFee`

## [1.1.3] - 2025-05-07

### Changed

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
