import { useState, type FormEvent } from 'react';
import { Button, Card } from '../../components/ui/primitives';
import { exactDecimal } from '../../lib/pos-api';
import { Field } from '../inventory/InventoryUI';
import {
  CommandState,
  QueryState,
  VariantSelect,
  type Choice,
} from './RestaurantUI';
import {
  useRestaurantCommand,
  useRestaurantQuery,
  useRestaurantScope,
} from './restaurant-hooks';

export interface Recipe {
  id: string;
  menu_variant_id: string;
  menu_name: string;
  revision: number;
  status: string;
  items: {
    ingredient_variant_id: string;
    ingredient_name: string;
    unit: string;
    quantity: string;
  }[];
}
export function RecipesScreen() {
  const scope = useRestaurantScope();
  const query = useRestaurantQuery<Recipe[]>(
    `/restaurant/recipes?branch_id=${scope.branch}`,
    'catalog.read',
  );
  const [editing, setEditing] = useState<Recipe | null>(null);
  return (
    <>
      <Card className="catalog-panel">
        <h2>สูตรวัตถุดิบ</h2>
        <p>
          ระบุปริมาณต่อ 1 จาน ตามหน่วยที่ตั้งให้วัตถุดิบ เช่น หมูหน่วย KG ใช้
          0.150 เท่ากับ 150 กรัม สูตรนี้ยังไม่ตัดวัตถุดิบจากการขายอัตโนมัติ
        </p>
        <QueryState query={query} />
        {query.data && !query.error ? (
          query.data.length === 0 ? (
            <p role="status">ยังไม่มีสูตรอาหารในสาขานี้</p>
          ) : (
            <ul className="restaurant-list">
              {query.data.map((recipe) => (
                <li key={recipe.id}>
                  <h3>
                    {recipe.menu_name} ·{' '}
                    {recipe.status === 'ACTIVE' ? 'ใช้งาน' : 'พักใช้'}
                  </h3>
                  <ul>
                    {recipe.items.map((item) => (
                      <li key={item.ingredient_variant_id}>
                        {item.ingredient_name}: {item.quantity} {item.unit} /
                        จาน
                      </li>
                    ))}
                  </ul>
                  {scope.can('catalog.update') ? (
                    <Button onClick={() => setEditing(recipe)}>
                      แก้ไขสูตร {recipe.menu_name}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Card>
      {scope.can('catalog.update') ? (
        <RecipeForm
          key={editing?.id ?? 'new'}
          recipe={editing}
          done={() => setEditing(null)}
        />
      ) : (
        <p role="status">ดูสูตรได้ แต่ไม่มีสิทธิ์แก้ไข</p>
      )}
    </>
  );
}
interface IngredientRow {
  key: string;
  choice: Choice | null;
  quantity: string;
}
function RecipeForm({
  recipe,
  done,
}: {
  recipe: Recipe | null;
  done: () => void;
}) {
  const scope = useRestaurantScope();
  const [menu, setMenu] = useState<Choice | null>(
    recipe
      ? {
          id: recipe.menu_variant_id,
          name: recipe.menu_name,
          unit: 'จาน',
          unitType: 'COUNT',
        }
      : null,
  );
  const [rows, setRows] = useState<IngredientRow[]>(
    () =>
      recipe?.items.map((item) => ({
        key: item.ingredient_variant_id,
        choice: {
          id: item.ingredient_variant_id,
          name: item.ingredient_name,
          unit: item.unit,
          unitType: '',
        },
        quantity: item.quantity,
      })) ?? [{ key: 'initial', choice: null, quantity: '' }],
  );
  const [status, setStatus] = useState(recipe?.status ?? 'ACTIVE');
  const [validation, setValidation] = useState('');
  const command = useRestaurantCommand<Recipe>(
    `/restaurant/recipes${recipe ? '/' + recipe.id : ''}`,
    recipe ? 'PUT' : 'POST',
    () => {
      if (recipe) done();
      else {
        setMenu(null);
        setRows([{ key: 'initial', choice: null, quantity: '' }]);
      }
    },
  );
  const update = (key: string, value: Partial<IngredientRow>) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, ...value } : row)));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      !menu ||
      rows.some(
        (row) =>
          !row.choice ||
          row.choice.id === menu.id ||
          (exactDecimal(row.quantity, 3) ?? 0n) <= 0n,
      ) ||
      new Set(rows.map((row) => row.choice?.id)).size !== rows.length
    ) {
      setValidation(
        'เลือกเมนูและวัตถุดิบไม่ซ้ำกัน ปริมาณต้องมากกว่า 0 และทศนิยมไม่เกิน 3 ตำแหน่ง',
      );
      return;
    }
    setValidation('');
    command.run({
      branch_id: scope.branch,
      menu_variant_id: menu.id,
      revision: recipe?.revision ?? 0,
      status,
      items: rows.map((row) => ({
        ingredient_variant_id: row.choice?.id,
        quantity: row.quantity,
      })),
    });
  };
  return (
    <Card className="catalog-panel">
      <h2>{recipe ? 'แก้ไขสูตร' : 'เพิ่มสูตรอาหาร'}</h2>
      <form onSubmit={submit} className="restaurant-form">
        <fieldset disabled={command.locked}>
          <VariantSelect label="เมนูอาหาร" value={menu} change={setMenu} />
          {rows.map((row, index) => (
            <div key={row.key} className="restaurant-ingredient">
              <VariantSelect
                label={`วัตถุดิบ ${index + 1}`}
                value={row.choice}
                change={(choice) => update(row.key, { choice })}
              />
              <Field
                label={`ปริมาณวัตถุดิบ ${index + 1} (${row.choice?.unit ?? 'หน่วยตามสินค้า'}) / จาน`}
              >
                <input
                  required
                  inputMode="decimal"
                  value={row.quantity}
                  onChange={(event) =>
                    update(row.key, { quantity: event.target.value })
                  }
                />
              </Field>
              <Button
                disabled={rows.length === 1}
                onClick={() =>
                  setRows(rows.filter((item) => item.key !== row.key))
                }
              >
                นำวัตถุดิบ {index + 1} ออก
              </Button>
            </div>
          ))}
          <Button
            disabled={rows.length >= 100}
            onClick={() =>
              setRows([
                ...rows,
                { key: crypto.randomUUID(), choice: null, quantity: '' },
              ])
            }
          >
            เพิ่มวัตถุดิบในสูตร
          </Button>
          <Field label="สถานะสูตร">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="ACTIVE">ใช้งาน</option>
              <option value="INACTIVE">พักใช้</option>
            </select>
          </Field>
        </fieldset>
        {validation ? <p role="alert">{validation}</p> : null}
        <CommandState command={command} />
        <div className="catalog-actions">
          <Button type="submit" disabled={command.isPending}>
            บันทึกสูตรอาหาร
          </Button>
          {recipe ? (
            <Button disabled={command.locked} onClick={done}>
              ยกเลิกการแก้ไข
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
