from app.models.product import Category, PriceChangeLog, Product


def test_product_is_the_only_tradeable_catalog_entity():
    assert hasattr(Product, "barcode")
    assert hasattr(Product, "category_id")
    assert hasattr(Product, "short_name")
    assert hasattr(Product, "specification")
    assert hasattr(Product, "standard_price")
    assert hasattr(Product, "cost_price")
    assert not hasattr(Product, "variants")


def test_category_is_flat_without_hierarchy_or_sorting():
    assert not hasattr(Category, "parent_id")
    assert not hasattr(Category, "sort_order")


def test_price_change_log_is_product_scoped():
    assert hasattr(PriceChangeLog, "product_id")
    assert hasattr(PriceChangeLog, "price_type")
    assert hasattr(PriceChangeLog, "level_id")
    assert hasattr(PriceChangeLog, "operator_name")
