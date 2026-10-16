/**
 * DataForSEO returns the money charged for a request in `cost`. Logging it lets us read the real
 * price per call from CloudWatch (search for "[dfs-cost]") and tune the credit costs.
 */
export function logDfsCost(path: string, data: any) {
    const cost = Number(data?.cost);
    if (Number.isFinite(cost) && cost > 0) console.log('[dfs-cost]', path, cost);
}
