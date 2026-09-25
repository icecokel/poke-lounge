-- All related keys share a hash tag. An expired lease can never authorize a stale write.
if redis.call('GET',KEYS[1])~=ARGV[1] then return {'fenced',''} end
if ARGV[5]~='' then
  local receipt=redis.call('GET',KEYS[5]);if receipt then return {'replayed',receipt} end
end
local raw=redis.call('GET',KEYS[2]);if not raw then return {'missing',''} end
local current=cjson.decode(raw);local next=cjson.decode(ARGV[3])
if current.roomInstanceId~=next.roomInstanceId or current.roomCode~=next.roomCode
  or current.createdAtMs~=next.createdAtMs or current.hardExpiresAtMs~=next.hardExpiresAtMs
  or current.storageVersion~=tonumber(ARGV[2]) or next.storageVersion~=current.storageVersion+1
  or next.revision<current.revision then return {'conflict',''} end
if (current.status=='closed' or current.status=='completed') and
  (next.status~=current.status or next.terminalAtMs~=current.terminalAtMs) then return {'closed',''} end
local t=redis.call('TIME');local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
if next.status~='closed' and next.status~='completed' and now>=current.hardExpiresAtMs then return {'expired',''} end
redis.call('SET',KEYS[2],ARGV[3],'PXAT',ARGV[4])
if redis.call('GET',KEYS[3])==next.roomInstanceId then redis.call('PEXPIREAT',KEYS[3],ARGV[4]) end
if next.status=='closed' or next.status=='completed' then redis.call('ZREM',KEYS[4],next.roomInstanceId)
else redis.call('ZADD',KEYS[4],ARGV[7],next.roomInstanceId) end
if ARGV[5]~='' then redis.call('SET',KEYS[5],ARGV[5],'PXAT',ARGV[6]) end
return {'committed',ARGV[5]}
