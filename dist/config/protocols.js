"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.protocols = void 0;
exports.protocols = {
    aave: {
        ethereum: {
            poolAddressesProvider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
            uiPoolDataProvider: '0x3F78BBD206e4D3c504Eb854232EdA7e47E9Fd8FC',
        },
    },
    lido: {
        ethereum: {
            stETH: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
            wstETH: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
        },
    },
    yearn: {
        ethereum: {
            vaults: {
                ethVault: '0x19D3364A399d251E894aC732651be8B0E4e85001',
                usdcVault: '0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE',
                daiVault: '0xdA816459F1AB5631232FE5e97a05BBBb94970c95',
            },
        },
    },
    pendle: {
        ethereum: {
            pendleToken: '0x808507121b80c02388fad14726482e061b8da827',
            vePendle: '0x4f30A9D41B80ecC5B94306AB4364951AE3170210',
            marketFactory: '0x6fcf753f2C67b83f7B09746Bbc4FA0047b35D050',
        },
    },
};
//# sourceMappingURL=protocols.js.map