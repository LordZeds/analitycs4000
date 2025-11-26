'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

interface AddSiteDialogProps {
    onSiteAdded: (site: any) => void
}

export function AddSiteDialog({ onSiteAdded }: AddSiteDialogProps) {
    const supabase = createClient()
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')
    const [url, setUrl] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSave = async () => {
        if (!name || !url) return

        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            alert('Usuário não autenticado')
            setLoading(false)
            return
        }

        const { data, error } = await supabase
            .from('sites')
            .insert({
                name,
                url,
                user_id: user.id
            })
            .select()
            .single()

        if (error) {
            console.error('Error adding site:', error)
            alert('Erro ao adicionar site.')
        } else {
            onSiteAdded(data)
            setOpen(false)
            setName('')
            setUrl('')
        }
        setLoading(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Site
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Adicionar Novo Site</DialogTitle>
                    <DialogDescription>
                        Cadastre um novo site para começar a monitorar.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="name" className="text-right text-sm font-medium">
                            Nome
                        </label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="col-span-3"
                            placeholder="Meu Site Incrível"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <label htmlFor="url" className="text-right text-sm font-medium">
                            URL
                        </label>
                        <Input
                            id="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="col-span-3"
                            placeholder="https://meusite.com"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading ? 'Salvando...' : 'Salvar Site'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
