# Database layer — conventions

- **Correlated subqueries:** inside a single-table `select`, Drizzle renders columns _without_
  their table name (`"id"`, not `"products"."id"`). In a raw `sql\`(select … where x = ${products.id})\``the outer column would therefore resolve against the inner table. Always write correlated
subqueries with explicit aliases and qualified outer columns:`sql\`(select count(*) from products p where p.category_id = "categories"."id")\``.
  Regression tests cover every such subquery.
- Money is stored as integer cents; tax rates as basis points.
- Every tenant table carries `restaurant_id`; services always filter on it.
