'use client'

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Site } from '@/types/supabase'

interface SiteSelectorProps {
    sites: Site[]
    selectedSiteId: string
    onSelect: (siteId: string) => void
}

export function SiteSelector({ sites, selectedSiteId, onSelect }: SiteSelectorProps) {
    return (
        <div className="w-[300px]">
            <Select value={selectedSiteId} onValueChange={onSelect}>
                <SelectTrigger>
                    <SelectValue placeholder="Selecione um site" />
                </SelectTrigger>
                <SelectContent>
                    {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                            {site.name} ({site.url})
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}
