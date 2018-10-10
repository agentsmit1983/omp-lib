import { Output, CryptoType, ToBeOutput, CryptoAddress, ISignature } from '../interfaces/crypto';
import { TransactionBuilder } from '../transaction-builder/transaction';
import { toSatoshis, fromSatoshis } from '../util';

/**
 * The abstract class for the Rpc class.
 */
export abstract class Rpc {

    public abstract async isConnected(): Promise<boolean>;
    public abstract async getVersion(): Promise<number>;
    public abstract async call(method: string, params: any[]): Promise<any>;

    public abstract async getNewAddress(): Promise<string>;
    public abstract async sendRawTransaction(rawtx: string): Promise<any>;
    public abstract async getRawTransaction(txid: string, verbose?: boolean, blockhash?: string): Promise<any>;
    public abstract async listUnspent(minconf?: number, maxconf?: number, addresses?: string[], includeUnsafe?: boolean,
                                      queryOptions?: any): Promise<any>;
    public abstract async lockUnspent(unlock: boolean, outputs: Output[], permanent?: boolean): Promise<any>;



    public async getNewPubkey(): Promise<string> {
        throw new Error('Not Implemented.');
    }

    public async getNormalOutputs(satoshis: number): Promise<Output[]> {
        const chosen: Output[] = [];
        let chosenSatoshis = 0;

        const unspent: Output[] = await this.listUnspent(0);

        unspent
            .filter((output: any) => output.spendable && output.safe)
            .find((utxo: any) => {
                    if (utxo.scriptPubKey.substring(0, 2) !== '76') {
                        // only take normal outputs into account
                        return false;
                    }

                    chosenSatoshis += toSatoshis(utxo.amount);
                    chosen.push({
                        txid: utxo.txid,
                        vout: utxo.vout,
                        _satoshis: toSatoshis(utxo.amount),
                        _scriptPubKey: utxo.scriptPubKey,
                        _address: utxo.address
                    });

                    if (chosenSatoshis >= satoshis) {
                        return true;
                    }
                    return false;
                }
            );

        if (chosenSatoshis < satoshis) {
            throw new Error('Not enough available output to cover the required amount.');
        }

        await this.lockUnspent(false, chosen, true);
        return chosen;
    }

    public async getSatoshisForUtxo(utxo: Output): Promise<Output> {
        const vout = (await this.getRawTransaction(utxo.txid, true))
            .vout.find((tmpVout: any) => tmpVout.n === utxo.vout);
        const utxoOmp: Output = vout;
        utxoOmp._satoshis = vout.valueSat;
        return utxoOmp;
    }

    public async importRedeemScript(script: any): Promise<boolean> {

        await this.call('importaddress', [script, '', false, true]);
    }

    public async signRawTransactionForInputs(tx: TransactionBuilder, inputs: Output[]): Promise<ISignature[]> {
        const r: ISignature[] = [];

        // needs to synchronize, because the order needs to match
        // the inputs order.
        for (const i of inputs) {
            if (i) {
                const input = inputs[i];
                // console.log('signing for ', input)
                const params = [
                    await tx.build(),
                    {
                        txid: input.txid,
                        vout: input.vout,
                        scriptPubKey: input._scriptPubKey,
                        amount: fromSatoshis(input._satoshis)
                    },
                    input._address
                ];

                const sig = {
                    signature: (await this.call('createsignaturewithwallet', params)),
                    pubKey: (await this.call('getaddressinfo', [input._address])).pubkey
                };
                r.push(sig);
                tx.addSignature(input, sig);
            }
        }

        return r;

    }

}

export type ILibrary = (parent: CryptoType) => Rpc;
