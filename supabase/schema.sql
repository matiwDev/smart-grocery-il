-- DATABASE SCHEMA DESIGN (PostgreSQL)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trigger for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- 1. Profiles Table
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nickname TEXT,
    phone_number TEXT,
    avatar_url TEXT,
    selected_skin TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 2. Households Table
CREATE TABLE households (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_households_updated_at
BEFORE UPDATE ON households
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 3. Household Members Table
CREATE TABLE household_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MEMBER')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(household_id, user_id)
);

-- 4. Baskets Table
CREATE TABLE baskets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID REFERENCES households(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_baskets_updated_at
BEFORE UPDATE ON baskets
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 5. Basket Items Table
CREATE TABLE basket_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    basket_id UUID NOT NULL REFERENCES baskets(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity_description TEXT,
    quantity_value NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_basket_items_updated_at
BEFORE UPDATE ON basket_items
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 6. Price Snapshots Table
CREATE TABLE price_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_name TEXT NOT NULL,
    shufersal_price NUMERIC,
    yohananof_price NUMERIC,
    victory_price NUMERIC,
    snapshot_date TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE baskets ENABLE ROW LEVEL SECURITY;
ALTER TABLE basket_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read and update their own profile
CREATE POLICY "Users can view their own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- Households: Users can view households they belong to
CREATE POLICY "Users can view their households"
ON households FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM household_members
        WHERE household_members.household_id = households.id
        AND household_members.user_id = auth.uid()
    )
);

-- Household Members: Users can view members of their households
CREATE POLICY "Users can view members of their households"
ON household_members FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = household_members.household_id
        AND hm.user_id = auth.uid()
    )
);

-- Baskets: Users can read/write their own baskets or baskets in their household
CREATE POLICY "Users can access their own or household baskets"
ON baskets FOR ALL
USING (
    user_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM household_members
        WHERE household_members.household_id = baskets.household_id
        AND household_members.user_id = auth.uid()
    )
)
WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM household_members
        WHERE household_members.household_id = baskets.household_id
        AND household_members.user_id = auth.uid()
    )
);

-- Basket Items: Users can read/write items in accessible baskets
CREATE POLICY "Users can access items in their own or household baskets"
ON basket_items FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM baskets
        WHERE baskets.id = basket_items.basket_id
        AND (
            baskets.user_id = auth.uid() OR
            EXISTS (
                SELECT 1 FROM household_members
                WHERE household_members.household_id = baskets.household_id
                AND household_members.user_id = auth.uid()
            )
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM baskets
        WHERE baskets.id = basket_items.basket_id
        AND (
            baskets.user_id = auth.uid() OR
            EXISTS (
                SELECT 1 FROM household_members
                WHERE household_members.household_id = baskets.household_id
                AND household_members.user_id = auth.uid()
            )
        )
    )
);

-- Price Snapshots: Anyone can read price snapshots (or authenticated users only)
CREATE POLICY "Anyone can view price snapshots"
ON price_snapshots FOR SELECT
TO authenticated
USING (true);

-- API backend service role can insert, we typically don't allow clients to insert
CREATE POLICY "Service role can insert price snapshots"
ON price_snapshots FOR INSERT
TO service_role
WITH CHECK (true);
