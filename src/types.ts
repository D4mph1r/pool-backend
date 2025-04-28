export type TPools = {
    tokenX: string,
    tokenY: string,
    curve: string
}

export type TPoolEvent = {
    pool: string[];
    txHash: string;
    sender: string;
    type: 'LiquidityAddedEvent' | 'LiquidityRemovedEvent';
    timestamp: string;
    data: {
        added_x_val?: string;
        added_y_val?: string;
        lp_tokens_received?: string;
        lp_tokens_burned?: string;
        returned_x_val?: string;
        returned_y_val?: string;
    };
};


export type TPoolsResponse = {
    data: TPoolEvent[];
};






export type TSenderObject = {
    sender: string;
    data: {
        added_x_val?: string;
        added_y_val?: string;
        lp_tokens_received?: string;
        lp_tokens_burned?: string;
        returned_x_val?: string;
        returned_y_val?: string;
    };
    timestamp: string;
};

export type TSenderEntries = {
    [sender: string]: TSenderObject[];
};

export type TPoolObject = {
    [poolName: string]: TSenderEntries[];
};
