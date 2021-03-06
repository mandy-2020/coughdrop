module JsonApi::ButtonSet
  extend JsonApi::Json
  
  TYPE_KEY = 'buttonset'
  DEFAULT_PAGE = 1
  MAX_PAGE = 1
  
  def self.build_json(button_set, args={})
    board = button_set.board
    json = {}
    if board
      json['id'] = board.global_id
      json['key'] = board.key
      json['name'] = board.settings && board.settings['name']
      json['full_set_revision'] = button_set.data['full_set_revision'] || board.full_set_revision
    end
    
    json['root_url'] = button_set.url_for(args[:permissions], board.settings['full_set_revision'])
    json['remote_enabled'] = !!ENV['REMOTE_EXTRA_DATA']

    # TODO: make this only accessible when REMOTE_EXTRA_DATA is not set
    if (!json['root_url'] || !args[:remote_support])
      bs_buttons = button_set.buttons
      json['buttons'] = (bs_buttons || []).map{|b| 
        res = {}.merge(b) 
        res['image'] = Uploader.fronted_url(b['image']) if b['image']
        res
      }

      board_ids = button_set.data['board_ids'] || bs_buttons.map{|b| b['board_id'] }.uniq
      
      # TODO: sharding
      allowed_ids = {}
      Board.where(:id => Board.local_ids(board_ids), :public => true).select('id').each do |b|
        allowed_ids[b.global_id] = true
      end
      # TODO: should site admins have access to all boards?
      allowed_ids[board.global_id] = true if board
      if args[:permissions]
        args[:permissions].private_viewable_board_ids.each do |id|
          allowed_ids[id] = true
        end
      end
      
      json['buttons'] = json['buttons'].select{|b| allowed_ids[b['board_id']] }
      json['board_ids'] = json['buttons'].map{|b| b['board_id'] }.compact.uniq
    end

    json
  end
end
