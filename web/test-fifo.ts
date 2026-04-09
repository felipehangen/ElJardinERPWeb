const item = {
    id: "harina-1",
    name: "Harina",
    cost: 400,
    stock: 5,
    batches: undefined
};

let remainingQty = 5;
let totalCost = 0;

let batches = item.batches && item.batches.length > 0 ? [...item.batches] : [{
    id: 'legacy-1',
    date: new Date(0).toISOString(),
    cost: item.cost,
    stock: item.stock
}];

batches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

for (const batch of batches) {
    if (remainingQty <= 0) break;
    if (batch.stock <= remainingQty) {
        totalCost += batch.stock * batch.cost;
        remainingQty -= batch.stock;
    } else {
        totalCost += remainingQty * batch.cost;
        remainingQty = 0;
    }
}

if (remainingQty > 0) {
    totalCost += remainingQty * item.cost;
}

console.log("Total Cost:", totalCost);
