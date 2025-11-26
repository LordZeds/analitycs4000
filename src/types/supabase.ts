export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Site = {
    id: string
    user_id: string
    name: string
    url: string
    tracking_domain?: string | null
    slug?: string | null
    associated_domains?: string[] | null
    ga4_measurement_id?: string | null
    ga4_api_key?: string | null
    meta_pixel_id?: string | null
    meta_api_key?: string | null
    hotmart_hottok?: string | null
    external_webhook_url?: string | null
    external_webhook_api_key?: string | null
    created_at: string
}

export type Pageview = {
    id: string
    site_id: string
    user_id: string
    timestamp: string
    visitor_id: string
    url_full: string | null
    url_path?: string | null
    page_title?: string | null
    referrer_url?: string | null

    // UTMs
    utm_source?: string | null
    utm_medium?: string | null
    utm_campaign?: string | null
    utm_content?: string | null
    utm_term?: string | null
    utm_id?: string | null

    // Contexto
    browser_name?: string | null
    browser_version?: string | null
    os_name?: string | null
    os_version?: string | null
    device_type?: string | null
    user_agent?: string | null

    // Geo / IP
    city?: string | null
    region?: string | null
    country_code?: string | null
    client_ip_address?: string | null
    language?: string | null

    // Screen
    screen_width?: number | null
    screen_height?: number | null
    viewport_width?: number | null
    viewport_height?: number | null

    // Performance
    page_load_time?: number | null

    // Click IDs
    fbc?: string | null
    fbp?: string | null
    gclid?: string | null
    fbclid?: string | null
    ttclid?: string | null
    epik?: string | null
    msclkid?: string | null
    meta_event_id?: string | null
    ga_client_id?: string | null
    ga_session_id?: string | null

    content_type?: string | null
}

export type InitiateCheckout = {
    id: string
    site_id: string
    user_id: string
    timestamp: string
    visitor_id: string
    session_id: string

    product_name?: string | null
    product_id?: string | null
    product_category?: string | null
    price_value?: number | null
    price_currency?: string | null

    // Contexto (mesmos do pageview)
    url_full?: string | null
    user_agent?: string | null
    client_ip_address?: string | null
    browser_name?: string | null
    os_name?: string | null
    device_type?: string | null

    // UTMs & Click IDs
    utm_source?: string | null
    utm_medium?: string | null
    utm_campaign?: string | null
    fbc?: string | null
    fbp?: string | null
    gclid?: string | null
    // ... outros click ids se necessário

    content_type?: string | null
}

export type Purchase = {
    id: string
    site_id: string
    user_id: string
    timestamp: string
    visitor_id: string | null
    session_id?: string | null
    transaction_id?: string | null

    product_name?: string | null
    product_id?: number | null
    price_value?: number | null
    price_currency?: string | null

    status?: string | null
    attribution_status?: string | null

    // Buyer Info
    buyer_email?: string | null
    buyer_name?: string | null
    buyer_phone?: string | null
    buyer_address?: string | null

    // Contexto
    url_full?: string | null
    client_ip_address?: string | null
    user_agent?: string | null

    // UTMs
    utm_source?: string | null
    utm_medium?: string | null
    utm_campaign?: string | null

    content_type?: string | null
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
