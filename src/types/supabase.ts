export type Site = {
    id: string
    user_id: string
    name: string
    url: string
}

export type Pageview = {
    id: string
    site_id: string
    timestamp: string
    visitor_id: string
    url_full: string
    utm_source?: string
    city?: string
    device_type?: string
}

export type InitiateCheckout = {
    id: string
    site_id: string
    timestamp: string
    visitor_id: string
    product_name: string
    price_value: number
}

export type Purchase = {
    id: string
    site_id: string
    timestamp: string
    visitor_id: string
    transaction_id: string
    product_name: string
    price_value: number
    status: string
    buyer_email?: string
    buyer_name?: string
}

export type SitePage = {
    id: string
    site_id: string
    path: string
    page_type: 'sales_page' | 'normal_page'
    created_at: string
}

export type Database = {
    public: {
        Tables: {
            sites: {
                Row: Site
                Insert: Partial<Site>
                Update: Partial<Site>
            }
            site_pages: {
                Row: SitePage
                Insert: Partial<SitePage>
                Update: Partial<SitePage>
            }
            pageviews: {
                Row: Pageview
                Insert: Partial<Pageview>
                Update: Partial<Pageview>
            }
            initiate_checkouts: {
                Row: InitiateCheckout
                Insert: Partial<InitiateCheckout>
                Update: Partial<InitiateCheckout>
            }
            purchases: {
                Row: Purchase
                Insert: Partial<Purchase>
                Update: Partial<Purchase>
            }
        }
    }
}
