package pricing

import (
	"math/big"
	"sort"
)

func allocate(amount int64, weights []int64) []int64 {
	result := make([]int64, len(weights))
	total := int64(0)
	for _, weight := range weights {
		total += weight
	}
	if total == 0 || amount == 0 {
		return result
	}
	type remainder struct {
		index int
		value *big.Int
	}
	remainders := []remainder{}
	assigned := int64(0)
	for index, weight := range weights {
		product := new(big.Int).Mul(big.NewInt(amount), big.NewInt(weight))
		quotient, rest := new(big.Int), new(big.Int)
		quotient.QuoRem(product, big.NewInt(total), rest)
		result[index] = quotient.Int64()
		assigned += result[index]
		remainders = append(remainders, remainder{index, rest})
	}
	sort.SliceStable(remainders, func(left, right int) bool { return remainders[left].value.Cmp(remainders[right].value) > 0 })
	for index := int64(0); index < amount-assigned; index++ {
		result[remainders[index].index]++
	}
	return result
}
func promotionAllocation(lines []Line, remaining []int64, rule Rule) ([]int64, error) {
	weights := make([]int64, len(lines))
	eligible := int64(0)
	for index, line := range lines {
		if (len(rule.VariantIDs) == 0 || contains(rule.VariantIDs, line.VariantID)) && (len(rule.CategoryIDs) == 0 || contains(rule.CategoryIDs, line.CategoryID)) {
			weights[index] = remaining[index]
			eligible += remaining[index]
		}
	}
	minimum, _ := Decimal(rule.MinimumSpend, 2)
	if eligible < minimum || eligible == 0 {
		return make([]int64, len(lines)), nil
	}
	amount, _ := Decimal(rule.Amount, 2)
	if rule.Type == "PERCENTAGE" {
		var err error
		amount, err = rounded(eligible, rule.BasisPoints, 10000)
		if err != nil {
			return nil, err
		}
	}
	if rule.Type == "BOGO" {
		type unit struct {
			index           int
			price, quantity int64
		}
		units := []unit{}
		quantity := int64(0)
		for index, line := range lines {
			if weights[index] == 0 {
				continue
			}
			count, err := Decimal(line.Quantity, 3)
			if err != nil {
				return nil, err
			}
			if count%1000 != 0 {
				continue
			}
			price, _ := Decimal(line.UnitPrice, 2)
			units = append(units, unit{index, price, count / 1000})
			quantity += count / 1000
		}
		free := quantity / (rule.Buy + rule.Get) * rule.Get
		sort.SliceStable(units, func(left, right int) bool { return units[left].price < units[right].price })
		result := make([]int64, len(lines))
		for _, item := range units {
			count := min(free, item.quantity)
			free -= count
			value, err := rounded(item.price, count, 1)
			if err != nil {
				return nil, err
			}
			result[item.index] = min(value, weights[item.index])
		}
		return result, nil
	}
	return allocate(min(amount, eligible), weights), nil
}
func Evaluate(lines []Line, promotions []Definition) (Quote, error) {
	quote := Quote{Lines: append([]Line{}, lines...), Promotions: []Applied{}}
	sort.Slice(quote.Lines, func(left, right int) bool { return quote.Lines[left].VariantID < quote.Lines[right].VariantID })
	remaining := make([]int64, len(lines))
	subtotal := int64(0)
	for index := range quote.Lines {
		line := &quote.Lines[index]
		price, err := Decimal(line.UnitPrice, 2)
		if err != nil {
			return quote, err
		}
		quantity, err := Decimal(line.Quantity, 3)
		if err != nil || quantity == 0 {
			return quote, ErrInput
		}
		gross, err := rounded(price, quantity, 1000)
		if err != nil || subtotal > Maximum-gross {
			return quote, ErrInput
		}
		line.Gross = Money(gross)
		remaining[index] = gross
		subtotal += gross
	}
	sort.Slice(promotions, func(left, right int) bool {
		if promotions[left].Priority != promotions[right].Priority {
			return promotions[left].Priority > promotions[right].Priority
		}
		return promotions[left].ID < promotions[right].ID
	})
	discounts := make([]int64, len(lines))
	stacked := []Applied{}
	stackTotal := int64(0)
	bestTotal := int64(0)
	var best []int64
	var winner Applied
	for _, promotion := range promotions {
		if promotion.Rule == nil {
			return quote, ErrInput
		}
		basis := remaining
		if promotion.Rule.Policy != "STACKABLE" {
			basis = make([]int64, len(lines))
			for index, line := range quote.Lines {
				basis[index], _ = Decimal(line.Gross, 2)
			}
		}
		allocation, err := promotionAllocation(quote.Lines, basis, *promotion.Rule)
		if err != nil {
			return quote, err
		}
		total := int64(0)
		for _, amount := range allocation {
			total += amount
		}
		if total == 0 {
			continue
		}
		applied := Applied{promotion.ID, promotion.Name, promotion.Revision, *promotion.Rule, Money(total)}
		if promotion.Rule.Policy == "STACKABLE" {
			for index, amount := range allocation {
				discounts[index] += amount
				remaining[index] -= amount
			}
			stackTotal += total
			stacked = append(stacked, applied)
		} else if total > bestTotal {
			bestTotal = total
			best = allocation
			winner = applied
		}
	}
	if bestTotal > stackTotal {
		discounts = best
		quote.Promotions = []Applied{winner}
		stackTotal = bestTotal
	} else {
		quote.Promotions = stacked
	}
	for index := range quote.Lines {
		gross, _ := Decimal(quote.Lines[index].Gross, 2)
		quote.Lines[index].Discount = Money(discounts[index])
		quote.Lines[index].Net = Money(gross - discounts[index])
	}
	quote.Subtotal = Money(subtotal)
	quote.Discount = Money(stackTotal)
	quote.Total = Money(subtotal - stackTotal)
	quote.Revision = Hash(quote)
	return quote, nil
}
func Manual(quote Quote, approvalID string, amount int64) (Quote, error) {
	total, _ := Decimal(quote.Total, 2)
	if amount <= 0 || amount > total {
		return quote, ErrInput
	}
	weights := make([]int64, len(quote.Lines))
	for index, line := range quote.Lines {
		weights[index], _ = Decimal(line.Net, 2)
	}
	allocations := allocate(amount, weights)
	for index, value := range allocations {
		discount, _ := Decimal(quote.Lines[index].Discount, 2)
		quote.Lines[index].Discount = Money(discount + value)
		quote.Lines[index].Net = Money(weights[index] - value)
	}
	discount, _ := Decimal(quote.Discount, 2)
	quote.Discount = Money(discount + amount)
	quote.Total = Money(total - amount)
	quote.ApprovalID = approvalID
	quote.Revision = ""
	quote.Revision = Hash(quote)
	return quote, nil
}
