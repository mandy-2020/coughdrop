module SecureSerialize
  extend ActiveSupport::Concern
  
  def paper_trail_for_secure_column?
    @for_secure ||= !!(self.class.respond_to?(:paper_trail_options) && self.class.paper_trail_options && 
          (!self.class.paper_trail_options[:only] || self.class.paper_trail_options[:only].include?(self.class.secure_column.to_s)))
  end
  
  # TODO: this is not very efficient, and I've heard rumors it was getting
  # folded into active_record by default anyway... Or, it wouldn't
  # be that hard to just replace serialize completely with some before and
  # after calls...
  def load_secure_object
    @secure_object_json = nil.to_json
    if self.id
      attr = read_attribute(self.class.secure_column)
      if attr && attr.match(/\s*^{/)
        @secure_object = JSON.parse(attr)
      else
        @secure_object = SecureJson.load(attr)
      end
      @secure_object_json = @secure_object.to_json
    end
    true
  end
  
  # If the serialized data has changed since initialize and paper_trail
  # is configured, then we need to manually mark the column as dirty
  # to make sure a proper paper_trail is maintained
  def mark_changed_secure_object_hash
    if !send("#{self.class.secure_column}_changed?")
      json = @secure_object.to_json
      if json != @secure_object_json
        send("#{self.class.secure_column}_will_change!")
      end
    end
    true
  end
  
  def persist_secure_object
    self.class.more_before_saves ||= []
    self.class.more_before_saves.each do |method|
      res = send(method)
      return false if res == false
    end
    mark_changed_secure_object_hash
    if send("#{self.class.secure_column}_changed?")
      secure = SecureJson.dump(@secure_object)
      @secure_object = SecureJson.load(secure)
      write_attribute(self.class.secure_column, secure)
    end
    true
  end

  module ClassMethods
    def secure_serialize(column)
      raise "only one secure column per record! (yes I'm lazy)" if self.respond_to?(:secure_column) && self.secure_column
#       serialize column, SecureJson
      cattr_accessor :secure_column
      cattr_accessor :more_before_saves
      self.secure_column = column
      prepend SecureSerializeHelpers
#       alias_method :real_reload, :reload
#       define_method(:reload) do |*args|
#         res = real_reload(*args)
#         load_secure_object
#         res
#       end
#       alias_method :real_set, '[]='
#       define_method('[]=') do |*args|
#         if args[0] == column
#           send("#{column}=", args[1])
#         else
#           real_set(*args)
#         end
#       end
      before_save :persist_secure_object
      define_singleton_method(:before_save) do |*args|
        raise "only simple before_save calls after secure_serialize: #{args.to_json}" unless args.length == 1 && args[0].is_a?(Symbol)
        self.more_before_saves ||= []
        self.more_before_saves << args[0]
      end
      define_method("#{column}") do 
        @secure_object
      end
      define_method("#{column}=") do |val|
        @secure_object = val
      end
      after_initialize :load_secure_object
    end
    
    def load_version(v)
      model = v.item
      attrs = v.object_deserialized
      return nil unless attrs
      if !model
        model = self.find_by(:id => v.item_id)
        model ||= self.new
        if model
          (model.attribute_names - attrs.keys).each { |k| attrs[k] = nil }
        end
      end
      attrs.each do |key, val|
        model.send("#{key}=", val)
      end
      model
    end
  end
  
  module SecureSerializeHelpers
    def reload(*args)
      res = super
      load_secure_object
      res
    end
    
    def []=(*args)
      if args[0].to_s == self.class.secure_column
        send("#{self.class.secure_column}=", args[1])
      else
        super
      end
    end
    
#     def read_attribute(*args)
#       if args[1] == 'force'
#         super(args[0])
#       else
#         if args[0].to_s == self.class.secure_column
#           @secure_object
#         else
#           super
#         end
#       end
#     end
#     
#     def write_attribute(*args)
#       if args[2] == 'force'
#         super(args[0], args[1])
#       else
#         if args[0].to_s == self.class.secure_column
#           send("#{self.class.secure_column}=", args[1])
#         else
#           super
#         end
#       end
#     end
  end
end