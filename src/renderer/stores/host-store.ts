import { create } from 'zustand'
import type { Host, Group } from '../types'

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

interface HostStore {
  hosts: Host[]
  groups: Group[]
  loading: boolean
  selectedHostId: string | null
  loadHosts: () => Promise<void>
  loadGroups: () => Promise<void>
  saveHost: (host: Omit<Host, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>
  deleteHost: (id: string) => Promise<void>
  saveGroup: (group: Omit<Group, 'id' | 'createdAt'> & { id?: string }) => Promise<void>
  deleteGroup: (id: string) => Promise<void>
  selectHost: (id: string | null) => void
}

export const useHostStore = create<HostStore>((set, get) => ({
  hosts: [],
  groups: [],
  loading: false,
  selectedHostId: null,

  loadHosts: async () => {
    const rows = await window.api.db.all('SELECT * FROM hosts ORDER BY sort_order ASC, name ASC')
    const hosts = []
    for (const r of rows) {
      let password = r.password
      let passphrase = r.passphrase
      // Decrypt if looks encrypted (base64 and encryption available)
      if (password && password.length > 20) {
        try { password = await window.api.app.decryptPassword(password) } catch { /* keep as-is */ }
      }
      if (passphrase && passphrase.length > 20) {
        try { passphrase = await window.api.app.decryptPassword(passphrase) } catch { /* keep as-is */ }
      }
      hosts.push({
        id: r.id,
        name: r.name,
        host: r.host,
        port: r.port,
        username: r.username,
        authMethod: r.auth_method,
        password,
        privateKeyPath: r.private_key_path,
        passphrase,
        groupId: r.group_id,
        color: r.color,
        notes: r.notes,
        sortOrder: r.sort_order,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      })
    }
    set({ hosts })
  },

  loadGroups: async () => {
    const rows = await window.api.db.all('SELECT * FROM `groups` ORDER BY sort_order ASC, name ASC')
    set({
      groups: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        parentId: r.parent_id,
        sortOrder: r.sort_order,
        createdAt: r.created_at,
        children: [],
        hosts: []
      }))
    })
  },

  saveHost: async (host) => {
    let password = host.password
    let passphrase = host.passphrase
    // Encrypt if plaintext
    if (password && password.length > 0 && !/^[A-Za-z0-9+/=]{20,}$/.test(password)) {
      try { password = await window.api.app.encryptPassword(password) } catch {}
    }
    if (passphrase && passphrase.length > 0 && !/^[A-Za-z0-9+/=]{20,}$/.test(passphrase)) {
      try { passphrase = await window.api.app.encryptPassword(passphrase) } catch {}
    }

    if (host.id) {
      await window.api.db.run(
        `UPDATE hosts SET name=?, host=?, port=?, username=?, auth_method=?, password=?,
         private_key_path=?, passphrase=?, group_id=?, color=?, notes=?, updated_at=datetime('now')
         WHERE id=?`,
        [host.name, host.host, host.port, host.username, host.authMethod,
         password, host.privateKeyPath, passphrase, host.groupId,
         host.color, host.notes, host.id]
      )
    } else {
      const id = generateId()
      await window.api.db.run(
        `INSERT INTO hosts (id, name, host, port, username, auth_method, password, private_key_path, passphrase, group_id, color, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, host.name, host.host, host.port, host.username, host.authMethod,
         password, host.privateKeyPath, passphrase, host.groupId,
         host.color, host.notes]
      )
    }
    await get().loadHosts()
  },

  deleteHost: async (id) => {
    await window.api.db.run('DELETE FROM hosts WHERE id=?', [id])
    await get().loadHosts()
  },

  saveGroup: async (group) => {
    if (group.id) {
      await window.api.db.run(
        'UPDATE `groups` SET name=?, parent_id=?, sort_order=? WHERE id=?',
        [group.name, group.parentId, group.sortOrder, group.id]
      )
    } else {
      const id = generateId()
      await window.api.db.run(
        'INSERT INTO `groups` (id, name, parent_id, sort_order) VALUES (?, ?, ?, ?)',
        [id, group.name, group.parentId, group.sortOrder ?? 0]
      )
    }
    await get().loadGroups()
  },

  deleteGroup: async (id) => {
    await window.api.db.run('DELETE FROM `groups` WHERE id=?', [id])
    await get().loadGroups()
    await get().loadHosts() // refresh hosts in case group_id was cleared
  },

  selectHost: (id) => set({ selectedHostId: id })
}))
