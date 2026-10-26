import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Trash2, X, Key, Clock } from 'lucide-react'

interface SystemUser {
  username: string
  uid: string
  gid: string
  home: string
  shell: string
  lastLogin: string
  hasSudo: boolean
}

interface SshKey {
  line: string
  type: string
  comment: string
}

interface UserManagementPanelProps {
  sessionId: string
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; code: number }>
  refreshKey: number
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}

export default function UserManagementPanel({
  sessionId,
  exec,
  refreshKey,
  setLoading,
  setError
}: UserManagementPanelProps) {
  const [users, setUsers] = useState<SystemUser[]>([])
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null)
  const [sshKeys, setSshKeys] = useState<SshKey[]>([])
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showAddKeyModal, setShowAddKeyModal] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newShell, setNewShell] = useState('/bin/bash')
  const [newKeyContent, setNewKeyContent] = useState('')
  const [userSubTab, setUserSubTab] = useState<'users' | 'keys'>('users')

  const fetchUsers = useCallback(async () => {
    try {
      // Get users with UID >= 1000 (normal users) + root
      const { stdout: passwdOut } = await exec("awk -F: '($3 >= 1000 || $3 == 0) { print $1\"||\"$3\"||\"$4\"||\"$6\"||\"$7 }' /etc/passwd")
      const { stdout: lastlogOut } = await exec('lastlog 2>/dev/null || echo ""')
      const { stdout: sudoersOut } = await exec('getent group sudo 2>/dev/null || getent group wheel 2>/dev/null || echo ""')

      const sudoUsers = new Set<string>()
      if (sudoersOut) {
        const parts = sudoersOut.split(':')
        if (parts.length >= 4) {
          parts[3].split(',').forEach((u) => sudoUsers.add(u.trim()))
        }
      }

      // Parse lastlog
      const lastLoginMap: Record<string, string> = {}
      lastlogOut.split('\n').forEach((line) => {
        const match = line.match(/^(\S+)\s+(\S+)\s+(.+)$/)
        if (match && match[1] !== 'Username' && !match[3].includes('**Never logged in**')) {
          lastLoginMap[match[1]] = match[3].trim()
        }
      })

      const userList: SystemUser[] = passwdOut.split('\n').filter(Boolean).map((line) => {
        const parts = line.split('||')
        const username = parts[0]
        return {
          username,
          uid: parts[1],
          gid: parts[2],
          home: parts[3],
          shell: parts[4],
          lastLogin: lastLoginMap[username] || 'Chưa đăng nhập',
          hasSudo: sudoUsers.has(username) || username === 'root'
        }
      })
      setUsers(userList)
      // Keep the selected user in sync (sudo/home changes would otherwise stay stale).
      setSelectedUser((prev) => (prev ? userList.find((u) => u.username === prev.username) ?? prev : prev))
    } catch (e: any) {
      setError(e.message || 'Lỗi tải danh sách users')
    }
  }, [exec, setError])

  const fetchSshKeys = useCallback(async (user: SystemUser) => {
    try {
      const { stdout } = await exec(`sudo cat ${user.home}/.ssh/authorized_keys 2>/dev/null || echo ""`)
      const keys: SshKey[] = stdout.split('\n').filter(Boolean).map((line) => {
        const parts = line.trim().split(/\s+/)
        return {
          line: line.trim(),
          type: parts[0] || '',
          comment: parts.length >= 3 ? parts.slice(2).join(' ') : ''
        }
      })
      setSshKeys(keys)
    } catch {
      setSshKeys([])
    }
  }, [exec])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    await fetchUsers()
    setLoading(false)
  }, [fetchUsers, setLoading, setError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  const handleSelectUser = async (user: SystemUser) => {
    setSelectedUser(user)
    await fetchSshKeys(user)
  }

  /** base64 tránh mọi lỗi quoting/expansion của shell với mật khẩu và SSH key. */
  const toBase64 = (text: string): string => {
    const bytes = new TextEncoder().encode(text)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  }

  const handleAddUser = async () => {
    const username = newUsername.trim()
    if (!username) return
    if (!/^[a-z_][a-z0-9_-]*$/.test(username)) {
      alert('Tên user không hợp lệ. Chỉ dùng chữ thường, số, gạch ngang.')
      return
    }
    if (newPassword && newPassword.includes('\n')) {
      alert('Mật khẩu không được chứa ký tự xuống dòng.')
      return
    }
    setLoading(true)
    const { code, stderr } = await exec(`sudo useradd -m -s ${newShell} "${username}"`)
    if (code !== 0) {
      alert('Lỗi tạo user: ' + stderr)
    } else if (newPassword) {
      const res = await exec(
        `echo '${toBase64(`${username}:${newPassword}`)}' | base64 -d | sudo chpasswd`
      )
      if (res.code !== 0) alert('Đã tạo user nhưng đặt mật khẩu thất bại: ' + (res.stderr || res.stdout))
    }
    await fetchUsers()
    setShowAddUserModal(false)
    setNewUsername('')
    setNewPassword('')
    setLoading(false)
  }

  const handleDeleteUser = async (username: string) => {
    if (username === 'root') { alert('Không thể xóa root'); return }
    if (!confirm(`Xóa user ${username} và thư mục home?`)) return
    setLoading(true)
    await exec(`sudo userdel -r "${username}" 2>/dev/null || sudo userdel "${username}"`)
    if (selectedUser?.username === username) {
      setSelectedUser(null)
      setSshKeys([])
    }
    await fetchUsers()
    setLoading(false)
  }

  const handleToggleSudo = async (username: string, currentlySudo: boolean) => {
    setLoading(true)
    if (currentlySudo) {
      await exec(`sudo deluser "${username}" sudo 2>/dev/null || sudo gpasswd -d "${username}" wheel 2>/dev/null`)
    } else {
      await exec(`sudo usermod -aG sudo "${username}" 2>/dev/null || sudo usermod -aG wheel "${username}" 2>/dev/null`)
    }
    await fetchUsers()
    setLoading(false)
  }

  const handleAddSshKey = async () => {
    if (!selectedUser || !newKeyContent.trim()) return
    setLoading(true)
    const keyLine = newKeyContent.trim() + '\n'
    const res = await exec(
      [
        `sudo mkdir -p "${selectedUser.home}/.ssh"`,
        `echo '${toBase64(keyLine)}' | base64 -d | sudo tee -a "${selectedUser.home}/.ssh/authorized_keys" > /dev/null`,
        `sudo chmod 700 "${selectedUser.home}/.ssh"`,
        `sudo chmod 600 "${selectedUser.home}/.ssh/authorized_keys"`,
        `sudo chown -R "${selectedUser.username}":"${selectedUser.username}" "${selectedUser.home}/.ssh"`
      ].join(' && ')
    )
    if (res.code !== 0) alert('Lỗi thêm key: ' + (res.stderr || res.stdout))
    await fetchSshKeys(selectedUser)
    setShowAddKeyModal(false)
    setNewKeyContent('')
    setLoading(false)
  }

  const handleDeleteSshKey = async (keyIndex: number) => {
    if (!selectedUser) return
    if (!confirm('Xóa SSH key này?')) return
    setLoading(true)
    // Delete by exact content: parsed indices skip blank/comment lines, so
    // `sed '<n>d'` could remove a different line and lock the user out.
    const keyLine = sshKeys[keyIndex]?.line
    if (keyLine) {
      const keyFile = `${selectedUser.home}/.ssh/authorized_keys`
      await exec(
        [
          `echo '${toBase64(keyLine + '\n')}' | base64 -d > /tmp/.terminux_key`,
          `sudo grep -vxF -f /tmp/.terminux_key "${keyFile}" > /tmp/.terminux_ak || true`,
          `sudo mv /tmp/.terminux_ak "${keyFile}"`,
          `sudo chown "${selectedUser.username}":"${selectedUser.username}" "${keyFile}"`,
          `rm -f /tmp/.terminux_key`
        ].join(' && ')
      )
    }
    await fetchSshKeys(selectedUser)
    setLoading(false)
  }

  return (
    <div className="flex-1 flex gap-4 overflow-hidden">
      {/* Left: Users List */}
      <div className="w-80 min-w-80 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">System Users</span>
          <button
            onClick={() => { setShowAddUserModal(true); setNewUsername(''); setNewPassword('') }}
            className="p-1 rounded hover:bg-white/5 text-[#89b4fa]"
            title="Thêm user"
          >
            <Plus size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {users.map((user) => (
            <button
              key={user.username}
              onClick={() => handleSelectUser(user)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all ${
                selectedUser?.username === user.username ? 'bg-[#89b4fa]/15 text-[#89b4fa]' : 'text-[#a6adc8] hover:bg-white/[0.02]'
              }`}
            >
              <Users size={14} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold flex items-center gap-2">
                  {user.username}
                  {user.hasSudo && (
                    <span className="px-1 py-0.5 rounded text-[8px] bg-[#f9e2af]/10 text-[#f9e2af] font-bold">SUDO</span>
                  )}
                </div>
                <div className="text-[9px] text-[#585b70]">UID: {user.uid} | {user.shell}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: User Details */}
      <div className="flex-1 bg-[#181825] border border-white/[0.04] rounded-xl flex flex-col overflow-hidden">
        {selectedUser ? (
          <>
            {/* User Info Header */}
            <div className="px-5 py-4 border-b border-white/[0.04] bg-[#11111b]/50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#cdd6f4]">{selectedUser.username}</h3>
                  <div className="text-[10px] text-[#585b70] mt-0.5 space-x-3">
                    <span>UID: {selectedUser.uid}</span>
                    <span>Home: {selectedUser.home}</span>
                    <span>Shell: {selectedUser.shell}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedUser.username !== 'root' && (
                    <>
                      <button
                        onClick={() => handleToggleSudo(selectedUser.username, selectedUser.hasSudo)}
                        className={`px-2 py-1 rounded text-[10px] font-bold ${
                          selectedUser.hasSudo ? 'bg-[#f9e2af]/10 text-[#f9e2af]' : 'bg-white/5 text-[#a6adc8]'
                        }`}
                      >
                        {selectedUser.hasSudo ? 'Bỏ sudo' : 'Cấp sudo'}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(selectedUser.username)}
                        className="p-1 rounded hover:bg-white/5 text-[#f38ba8]"
                        title="Xóa user"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-[#585b70]">
                <Clock size={9} />
                Last login: {selectedUser.lastLogin}
              </div>
            </div>

            {/* Sub tabs */}
            <div className="flex border-b border-white/[0.04]">
              <button
                onClick={() => setUserSubTab('users')}
                className={`flex-1 py-2 text-[10px] font-semibold text-center ${userSubTab === 'users' ? 'bg-[#89b4fa]/10 text-[#89b4fa]' : 'text-[#585b70]'}`}
              >
                Thông tin
              </button>
              <button
                onClick={() => setUserSubTab('keys')}
                className={`flex-1 py-2 text-[10px] font-semibold text-center ${userSubTab === 'keys' ? 'bg-[#89b4fa]/10 text-[#89b4fa]' : 'text-[#585b70]'}`}
              >
                SSH Keys ({sshKeys.length})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {userSubTab === 'users' ? (
                <div className="space-y-4">
                  <div className="bg-[#11111b] rounded-lg p-4 space-y-2 text-xs">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#585b70] mb-3">Chi tiết User</h4>
                    {[
                      ['Username', selectedUser.username],
                      ['UID / GID', `${selectedUser.uid} / ${selectedUser.gid}`],
                      ['Home Directory', selectedUser.home],
                      ['Shell', selectedUser.shell],
                      ['Sudo Access', selectedUser.hasSudo ? 'Có' : 'Không'],
                      ['Last Login', selectedUser.lastLogin],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-[#585b70]">{label}</span>
                        <span className="font-mono text-[#cdd6f4]">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Change password */}
                  <div className="bg-[#11111b] rounded-lg p-4 space-y-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#585b70] mb-2">Đổi mật khẩu</h4>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="Mật khẩu mới..."
                        className="flex-1 bg-[#181825] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-[#cdd6f4] outline-none"
                        id="change-pass-input"
                      />
                      <button
                        onClick={async () => {
                          const input = document.getElementById('change-pass-input') as HTMLInputElement
                          if (!input?.value) return
                          if (input.value.includes('\n')) {
                            alert('Mật khẩu không được chứa ký tự xuống dòng.')
                            return
                          }
                          setLoading(true)
                          const res = await exec(
                            `echo '${toBase64(`${selectedUser.username}:${input.value}`)}' | base64 -d | sudo chpasswd`
                          )
                          input.value = ''
                          alert(res.code === 0 ? 'Đã đổi mật khẩu thành công' : 'Lỗi: ' + (res.stderr || res.stdout))
                          setLoading(false)
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold hover:bg-[#74c7ec] transition-all"
                      >
                        Đổi
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#585b70]">Authorized Keys</span>
                    <button
                      onClick={() => { setShowAddKeyModal(true); setNewKeyContent('') }}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-[#89b4fa]/10 text-[#89b4fa] text-[10px] font-bold hover:bg-[#89b4fa]/20"
                    >
                      <Key size={10} /> Thêm Key
                    </button>
                  </div>
                  {sshKeys.length === 0 ? (
                    <div className="text-center text-[#585b70] text-xs py-8">Chưa có SSH key nào.</div>
                  ) : (
                    sshKeys.map((key, idx) => (
                      <div key={idx} className="bg-[#11111b] rounded-lg p-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-[#585b70]">{key.type}</div>
                          <div className="text-xs text-[#cdd6f4] font-mono truncate" title={key.line}>
                            {key.line.substring(0, 80)}...
                          </div>
                          {key.comment && <div className="text-[10px] text-[#89b4fa] mt-0.5">{key.comment}</div>}
                        </div>
                        <button
                          onClick={() => handleDeleteSshKey(idx)}
                          className="p-1 rounded hover:bg-white/5 text-[#f38ba8] shrink-0"
                          title="Xóa key"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#585b70]">
            <Users size={48} className="mb-3 opacity-20" />
            <span className="text-xs">Chọn một user để xem chi tiết</span>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddUserModal(false)}>
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[380px] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">Thêm User Mới</h3>
              <button onClick={() => setShowAddUserModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70]"><X size={14} /></button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Username</label>
                <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="newuser" className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Password (tùy chọn)</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Để trống nếu không cần" className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[#585b70] font-semibold">Shell đăng nhập</label>
                <select
                  value={newShell}
                  onChange={(e) => setNewShell(e.target.value)}
                  className="w-full bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none"
                >
                  <option value="/bin/bash">/bin/bash (đăng nhập + SFTP)</option>
                  <option value="/bin/sh">/bin/sh</option>
                  <option value="/usr/sbin/nologin">/usr/sbin/nologin (chỉ FTP/dịch vụ)</option>
                </select>
                <p className="text-[10px] text-[#45475a]">
                  Chọn nologin nếu tài khoản chỉ dùng cho FTP hoặc chạy dịch vụ.
                </p>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowAddUserModal(false)} className="px-4 py-1.5 rounded-lg font-semibold bg-white/5 hover:bg-white/10">Hủy</button>
                <button onClick={handleAddUser} className="px-4 py-1.5 rounded-lg font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec]">Tạo User</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add SSH Key Modal */}
      {showAddKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddKeyModal(false)}>
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl shadow-2xl w-[500px] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#181825]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#a6adc8]">Thêm SSH Key cho {selectedUser?.username}</h3>
              <button onClick={() => setShowAddKeyModal(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#585b70]"><X size={14} /></button>
            </div>
            <div className="p-5 space-y-3">
              <textarea
                value={newKeyContent}
                onChange={(e) => setNewKeyContent(e.target.value)}
                placeholder="ssh-rsa AAAA... user@host"
                className="w-full h-24 bg-[#181825] border border-white/5 rounded-lg px-3 py-2 text-xs text-[#cdd6f4] outline-none font-mono resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddKeyModal(false)} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10">Hủy</button>
                <button onClick={handleAddSshKey} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec]">Thêm Key</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
